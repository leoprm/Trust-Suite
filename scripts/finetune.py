#!/usr/bin/env python3
"""
Trust Maker — Unsloth QLoRA Fine-Tuning Pipeline
=================================================
Reference-level script. Requires GPU with ≥12 GB VRAM.

Usage:
  python scripts/finetune.py \
    --job-id <uuid> \
    --base-model unsloth/Llama-3.2-3B-Instruct \
    --dataset tasks_export.jsonl \
    --output ./fine-tuned-models/<job-id>

Architecture:
  - Unsloth for 2-5x faster training, 60 % less VRAM
  - QLoRA (NF4 quantization) for memory efficiency
  - SFTTrainer (TRL) with chat template
  - Merged adapter saved as 16-bit for vLLM / llama.cpp

Environment:
  pip install unsloth torch transformers datasets trl peft accelerate
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Unsloth imports (patches torch / transformers) ──────────────────────────
# trunk-ignore(ruff/E402)
from unsloth import FastLanguageModel, is_bfloat16_supported  # noqa: E402
from unsloth.chat_templates import get_chat_template, standardize_sharegpt  # noqa: E402

import torch  # noqa: E402
from datasets import Dataset, load_dataset  # noqa: E402
from transformers import TrainingArguments  # noqa: E402
from trl import SFTTrainer  # noqa: E402


# ═══════════════════════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class FineTuneConfig:
    """All hyperparameters. Override via CLI or environment."""

    # Model
    base_model: str = "unsloth/Llama-3.2-3B-Instruct"
    max_seq_length: int = 2048
    dtype: Optional[torch.dtype] = None        # auto-detect
    load_in_4bit: bool = True                  # QLoRA

    # LoRA
    lora_r: int = 16
    lora_alpha: int = 16
    lora_dropout: float = 0.0
    lora_target_modules: list[str] = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ])
    use_gradient_checkpointing: str = "unsloth"  # "unsloth" | "default" | False

    # Training
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 4
    warmup_steps: int = 5
    max_steps: int = 60
    learning_rate: float = 2e-4
    logging_steps: int = 1
    save_steps: int = 0          # only save at end
    optim: str = "adamw_8bit"
    weight_decay: float = 0.01
    lr_scheduler_type: str = "linear"
    seed: int = 3407

    # Output
    output_dir: str = "./fine-tuned-models/default"
    merge_before_save: bool = True
    push_to_hub: bool = False
    hub_model_id: Optional[str] = None

    # Dataset
    dataset_path: Optional[str] = None          # local .jsonl or HF repo
    dataset_format: str = "sharegpt"            # sharegpt | alpaca | custom
    train_split: float = 0.95
    max_samples: Optional[int] = None           # cap for fast experimentation


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset loader
# ═══════════════════════════════════════════════════════════════════════════════

def load_training_dataset(cfg: FineTuneConfig) -> Dataset:
    """Load a ShareGPT-formatted dataset from local file or HuggingFace."""

    if cfg.dataset_path and os.path.isfile(cfg.dataset_path):
        raw = []
        with open(cfg.dataset_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    raw.append(json.loads(line))
        ds = Dataset.from_list(raw)

    elif cfg.dataset_path:
        ds = load_dataset(cfg.dataset_path, split="train")

    else:
        raise ValueError("No dataset_path provided — nothing to fine-tune on.")

    if cfg.max_samples and len(ds) > cfg.max_samples:
        ds = ds.select(range(cfg.max_samples))

    # Standardize to ShareGPT format for Unsloth
    if cfg.dataset_format == "sharegpt":
        ds = standardize_sharegpt(ds)

    return ds


# ═══════════════════════════════════════════════════════════════════════════════
# Core pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def run_finetune(cfg: FineTuneConfig):
    """Full fine-tuning run: load → train → save → metrics."""

    started_at = datetime.now(timezone.utc)

    # ── 1. Load model & tokenizer ─────────────────────────────────────────
    print(f"[finetune] Loading {cfg.base_model} …")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=cfg.base_model,
        max_seq_length=cfg.max_seq_length,
        dtype=cfg.dtype,
        load_in_4bit=cfg.load_in_4bit,
    )

    # ── 2. LoRA adapters ──────────────────────────────────────────────────
    model = FastLanguageModel.get_peft_model(
        model,
        r=cfg.lora_r,
        target_modules=cfg.lora_target_modules,
        lora_alpha=cfg.lora_alpha,
        lora_dropout=cfg.lora_dropout,
        bias="none",
        use_gradient_checkpointing=cfg.use_gradient_checkpointing,
        random_state=cfg.seed,
    )

    # ── 3. Chat template ──────────────────────────────────────────────────
    tokenizer = get_chat_template(
        tokenizer,
        chat_template="llama-3.1",        # works for Llama 3.2, Mistral, etc.
    )

    # ── 4. Dataset ────────────────────────────────────────────────────────
    ds = load_training_dataset(cfg)
    if cfg.train_split < 1.0:
        ds = ds.train_test_split(test_size=1.0 - cfg.train_split, seed=cfg.seed)
        train_ds = ds["train"]
        eval_ds = ds["test"]
    else:
        train_ds = ds
        eval_ds = None

    print(f"[finetune] Training samples: {len(train_ds)}")
    if eval_ds:
        print(f"[finetune]   Eval samples: {len(eval_ds)}")

    # ── 5. Trainer ────────────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=cfg.output_dir,
        per_device_train_batch_size=cfg.per_device_train_batch_size,
        gradient_accumulation_steps=cfg.gradient_accumulation_steps,
        warmup_steps=cfg.warmup_steps,
        max_steps=cfg.max_steps,
        learning_rate=cfg.learning_rate,
        logging_steps=cfg.logging_steps,
        save_steps=cfg.save_steps,
        optim=cfg.optim,
        weight_decay=cfg.weight_decay,
        lr_scheduler_type=cfg.lr_scheduler_type,
        seed=cfg.seed,
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        report_to="none",                     # disable W&B / TensorBoard
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        dataset_text_field="text",
        max_seq_length=cfg.max_seq_length,
    )

    # ── 6. Train ──────────────────────────────────────────────────────────
    print("[finetune] Starting training …")
    train_start = time.monotonic()
    trainer_stats = trainer.train()
    train_elapsed_s = time.monotonic() - train_start

    completed_at = datetime.now(timezone.utc)

    # ── 7. Extract metrics ────────────────────────────────────────────────
    metrics: dict[str, object] = {
        "train_runtime_seconds": round(train_elapsed_s, 2),
        "train_samples": len(train_ds),
        "eval_samples": len(eval_ds) if eval_ds else 0,
        "max_steps": cfg.max_steps,
        "total_flos": getattr(trainer_stats, "total_flos", None),
        "train_loss": getattr(trainer_stats, "training_loss", None),
        "perplexity": (
            round(float(torch.exp(torch.tensor(trainer_stats.training_loss))), 4)
            if getattr(trainer_stats, "training_loss", None) is not None
            else None
        ),
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
    }

    print(f"[finetune] Training finished in {train_elapsed_s:.0f}s")
    print(f"[finetune] Loss: {metrics['train_loss']}")
    print(f"[finetune] Perplexity: {metrics['perplexity']}")

    # ── 8. Save ───────────────────────────────────────────────────────────
    if cfg.merge_before_save:
        print("[finetune] Merging LoRA weights → 16-bit …")
        model.save_pretrained_merged(cfg.output_dir, tokenizer, save_method="merged_16bit")
    else:
        model.save_pretrained(cfg.output_dir)
        tokenizer.save_pretrained(cfg.output_dir)

    # Save metrics alongside model
    metrics_path = os.path.join(cfg.output_dir, "metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)

    print(f"[finetune] Model saved → {cfg.output_dir}")
    print(f"[finetune] Metrics saved → {metrics_path}")

    # ── 9. Optional: push to HuggingFace Hub ──────────────────────────────
    if cfg.push_to_hub and cfg.hub_model_id:
        print(f"[finetune] Pushing to HF Hub → {cfg.hub_model_id}")
        # trunk-ignore(ruff/F821)
        model.push_to_hub_merged(cfg.hub_model_id, tokenizer, save_method="merged_16bit")

    return metrics


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Trust Maker — Unsloth QLoRA Fine-Tuning")
    p.add_argument("--job-id", required=True, help="FineTuneJob UUID (for output subdir)")
    p.add_argument("--base-model", default="unsloth/Llama-3.2-3B-Instruct")
    p.add_argument("--dataset", required=True, help="Path to .jsonl training data")
    p.add_argument("--output", default="./fine-tuned-models", help="Base output directory")
    p.add_argument("--max-steps", type=int, default=60)
    p.add_argument("--max-seq-length", type=int, default=2048)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--learning-rate", type=float, default=2e-4)
    p.add_argument("--max-samples", type=int, default=None)
    p.add_argument("--push-to-hub", action="store_true")
    p.add_argument("--hub-model-id", default=None)
    return p


if __name__ == "__main__":
    args = build_parser().parse_args()

    output_dir = os.path.join(args.output, args.job_id)

    cfg = FineTuneConfig(
        base_model=args.base_model,
        dataset_path=args.dataset,
        output_dir=output_dir,
        max_steps=args.max_steps,
        max_seq_length=args.max_seq_length,
        lora_r=args.lora_r,
        learning_rate=args.learning_rate,
        max_samples=args.max_samples,
        push_to_hub=args.push_to_hub,
        hub_model_id=args.hub_model_id,
    )

    try:
        metrics = run_finetune(cfg)
        print("[finetune] Done.")
        # Output metrics as last line for the parent process to parse
        print("METRICS:", json.dumps(metrics))
        sys.exit(0)
    except Exception as exc:
        print(f"[finetune] FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
