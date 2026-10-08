/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

declare namespace App {
  interface Locals {
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
    isAdmin: boolean;
    cfContext: ExecutionContext;
  }
}

declare module "simplify-js" {
  export default function simplify<T extends { x: number; y: number }>(
    points: T[],
    tolerance?: number,
    highestQuality?: boolean,
  ): T[];
}
