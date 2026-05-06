import multer from 'multer';
import { ALLOWED_UPLOAD_TYPES, validateUploadFile } from '../utils/fileSecurity';

const storage = multer.memoryStorage();
const maxUploadBytes = Number(process.env.MAX_UPLOAD_SIZE_MB || 10) * 1024 * 1024;

export const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadBytes,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_TYPES[file.mimetype]) {
      cb(new Error('Tipo de archivo no permitido'));
      return;
    }

    const validation = validateUploadFile({ ...file, size: 0 } as Express.Multer.File);
    if (!validation.ok) {
      cb(new Error(`Archivo rechazado: ${validation.reason}`));
      return;
    }

    cb(null, true);
  },
});
