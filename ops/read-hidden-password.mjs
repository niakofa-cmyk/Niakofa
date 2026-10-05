import { emitKeypressEvents } from "node:readline";

export function readHiddenPassword({
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("PROMPT_PASSWORD=1 requires an interactive terminal.");
  }

  emitKeypressEvents(input);

  const wasRaw = Boolean(input.isRaw);
  const wasPaused = input.isPaused?.() ?? false;

  return new Promise((resolve, reject) => {
    let value = "";
    let finished = false;

    const finish = (error) => {
      if (finished) return;
      finished = true;
      input.off("keypress", onKeypress);
      input.off("close", onClose);
      try {
        input.setRawMode(wasRaw);
      } catch {
        // Preserve the original result if the terminal is already closing.
      }
      if (wasPaused) input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onKeypress = (sequence, key = {}) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) {
        finish(new Error("password entry cancelled."));
        return;
      }
      if (key.name === "return" || key.name === "enter" || sequence === "\r" || sequence === "\n") {
        finish();
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (typeof sequence === "string" && !key.ctrl && !key.meta) {
        value += sequence;
      }
    };

    const onClose = () => finish(new Error("password input ended."));
    input.on("keypress", onKeypress);
    input.once("close", onClose);

    try {
      input.setRawMode(true);
      output.write("Password: ");
      input.resume();
    } catch {
      finish(new Error("could not enable hidden password input."));
    }
  });
}