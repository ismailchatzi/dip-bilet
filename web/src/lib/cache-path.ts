import path from "path";

/** Netlify/serverless: sadece /tmp yazılabilir */
export function cacheDir(): string {
  const serverless =
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().startsWith("/var/task");
  if (serverless) {
    return path.join("/tmp", "dip-bilet-cache");
  }
  return path.join(process.cwd(), ".cache");
}

export function cacheFile(name: string): string {
  return path.join(cacheDir(), name);
}
