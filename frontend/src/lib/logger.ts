// A simple, portable logging utility.
// By default, it logs to the console.
// We can easily extend this to write to a file or a cloud service.

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const log = (level: LogLevel, message: string, context: any = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    context: context ? JSON.stringify(context, null, 2) : undefined,
  };

  // For now, we just log to the console.
  // We could add a 'transport' here to write to a file.
  switch (level) {
    case "ERROR":
      console.error(logEntry);
      break;
    case "WARN":
      console.warn(logEntry);
      break;
    case "INFO":
      console.info(logEntry);
      break;
    case "DEBUG":
      // We can set a global env var to turn debug logs on/off
      if (process.env.LOG_LEVEL === "DEBUG") {
        console.log(logEntry);
      }
      break;
    default:
      console.log(logEntry);
  }
};

export const logger = {
  debug: (message: string, context?: any) => log("DEBUG", message, context),
  info: (message: string, context?: any) => log("INFO", message, context),
  warn: (message: string, context?: any) => log("WARN", message, context),
  error: (message: string, error?: any, context?: any) => {
    // Handle error objects specifically
    const errorContext = {
      ...(error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error }),
      ...context,
    };
    log("ERROR", message, errorContext);
  },
};
