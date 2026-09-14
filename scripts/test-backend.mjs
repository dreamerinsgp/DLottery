import path from "node:path";
import { root, postgres, run, stop } from "./processes.mjs";
let db;
try {
  db = process.env.TEST_DATABASE_URL
    ? null
    : await postgres(path.join(root, ".local/backend-tests"), 55434);
  run("go", ["test", "-race", "-count=1", "./..."], {
    cwd: path.join(root, "backend"),
    env: {
      ...process.env,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || db.url,
    },
  });
} finally {
  await stop(db?.proc);
}
