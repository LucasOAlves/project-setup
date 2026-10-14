import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./modules/auth/password.js";

// Prints the two sign-in settings for .env. The password is read without echo and never stored.
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    muted = true;
    prompt.question("", (answer) => {
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await ask("Password (at least 12 characters): ");
const again = process.stdin.isTTY ? await ask("Again: ") : password;
prompt.close();
if (password !== again) {
  console.error("The two passwords differ.");
  process.exit(1);
}
try {
  console.log(`APP_PASSWORD_HASH=${await hashPassword(password)}`);
  console.log(`SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
