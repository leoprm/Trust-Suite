## Why

El modelo de suscripción dinámica de Trust Maker necesita reflejar economías de escala reales: a más usuarios, menor costo por usuario. Actualmente usamos una aproximación √n (raíz cuadrada), pero necesitamos validar si este exponente (0.5) es el óptimo basado en datos reales de empresas SaaS y cloud.

## What Changes

- Investigar cómo escalan los costos de infraestructura en empresas SaaS reales (AWS, startups, scale-ups)
- Determinar el exponente óptimo (elasticidad) para la fórmula `costo_user(n) = costo_base / (n/n_base)^e`
- Documentar hallazgos con datos de referencia
- Ajustar el motor de suscripción dinámica con el exponente validado

## Capabilities

### New Capabilities
- `pricing-research`: Investigación sobre economías de escala en SaaS y cloud — encontrar el exponente óptimo

### Modified Capabilities
- _Ninguna_ — es investigación previa a modificar código

## Impact

- **Motor de suscripción:** Se ajustará la fórmula en `subscriptionEngine.ts` con el nuevo exponente
- **Sin impacto en usuario final:** El cambio es interno, solo afecta el cálculo del precio
