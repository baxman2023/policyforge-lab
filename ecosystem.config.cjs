const fs = require("node:fs");
const path = require("node:path");

function resolveNodeRuntime() {
  const explicitHome = process.env.TSL_NODE_HOME;
  const defaultHome = process.env.HOME ? path.join(process.env.HOME, ".local", "opt", "node-v22") : "";
  const runtimeHome = explicitHome || defaultHome;
  const nodeBin = runtimeHome ? path.join(runtimeHome, "bin", "node") : "";

  if (nodeBin && fs.existsSync(nodeBin)) {
    return {
      interpreter: nodeBin,
      binDir: path.dirname(nodeBin)
    };
  }

  return {
    interpreter: process.env.TSL_NODE_INTERPRETER || "node",
    binDir: null
  };
}

const runtime = resolveNodeRuntime();

module.exports = {
  apps: [
    {
      name: "policyforge-lab",
      script: "start-policyforge-lab.cjs",
      cwd: __dirname,
      interpreter: process.env.TSL_NODE_INTERPRETER || runtime.interpreter,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3138",
        HOSTNAME: "127.0.0.1",
        PATH: runtime.binDir ? `${runtime.binDir}:${process.env.PATH || ""}` : process.env.PATH
      }
    },
    {
      name: "policyforge-worker",
      script: "scripts/policyforge-worker.cjs",
      cwd: __dirname,
      interpreter: process.env.TSL_NODE_INTERPRETER || runtime.interpreter,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3138",
        WORKER_CONCURRENCY: "3",
        PATH: runtime.binDir ? `${runtime.binDir}:${process.env.PATH || ""}` : process.env.PATH
      }
    }
  ]
};
