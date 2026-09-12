import { verifyRequest } from '../lib/auth.js';

export default function handler(req, res) {
  const session = verifyRequest(req);
  res.status(200).json({ loggedIn: !!session });
}
