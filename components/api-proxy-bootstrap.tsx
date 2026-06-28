"use client";

import { useEffect } from "react";
import { installApiFetchProxy } from "@/lib/client-api";

export function ApiProxyBootstrap() {
  useEffect(() => {
    installApiFetchProxy();
  }, []);

  return null;
}
