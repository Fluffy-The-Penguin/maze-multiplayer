import { proxyMaze } from "../_mazeProxy.js";

export default function handler(req, res) {
  return proxyMaze(req, res, "health");
}
