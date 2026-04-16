import { Router } from 'express';

const router = Router();

// Ruta temporal para que Vercel no marque error
router.get('/', (_req, res) => {
  res.json({ message: 'Chat sessions route is active' });
});

router.post('/', (_req, res) => {
  res.json({ message: 'Chat endpoint ready' });
});

export default router;