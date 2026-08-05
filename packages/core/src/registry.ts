import type { Diagnostic } from "./diagnostics.js";
import type { DomainRuntime, RuntimeDescriptor } from "./runtime.js";

function cloneDescriptor(descriptor: RuntimeDescriptor): RuntimeDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as RuntimeDescriptor;
}

export interface RegistryResolveSuccess {
  ok: true;
  runtime: DomainRuntime<unknown, unknown>;
  descriptor: RuntimeDescriptor;
}

export interface RegistryResolveFailure {
  ok: false;
  diagnostics: Diagnostic[];
}

export type RegistryResolveResult = RegistryResolveSuccess | RegistryResolveFailure;

/**
 * In-memory registry of DomainRuntime instances keyed by domain id.
 * Rejects duplicate domains; unknown domains return structured diagnostics.
 * resolve() returns DomainRuntime<unknown, unknown> — callers must narrow with a type guard.
 */
export class RuntimeRegistry {
  private readonly runtimes = new Map<string, DomainRuntime<unknown, unknown>>();
  private readonly descriptors = new Map<string, RuntimeDescriptor>();

  async register(runtime: DomainRuntime<unknown, unknown>): Promise<RuntimeDescriptor> {
    const descriptor = await runtime.descriptor();
    if (!descriptor.domain || typeof descriptor.domain !== "string") {
      throw new Error("RuntimeDescriptor.domain must be a non-empty string.");
    }
    if (this.runtimes.has(descriptor.domain)) {
      throw new Error(`Domain '${descriptor.domain}' is already registered.`);
    }
    const stored = cloneDescriptor(descriptor);
    this.runtimes.set(descriptor.domain, runtime);
    this.descriptors.set(descriptor.domain, stored);
    return cloneDescriptor(stored);
  }

  async resolve(domain: string): Promise<RegistryResolveResult> {
    const runtime = this.runtimes.get(domain);
    const descriptor = this.descriptors.get(domain);
    if (!runtime || !descriptor) {
      return {
        ok: false,
        diagnostics: [{
          code: "UNKNOWN_DOMAIN",
          severity: "error",
          message: `No DomainRuntime is registered for domain '${domain}'.`,
          path: "domain",
          actual: domain,
          retryable: false,
          suggestedFixes: [{
            description: "Register a DomainRuntime for this domain before resolving."
          }]
        }]
      };
    }
    return {
      ok: true,
      runtime,
      descriptor: cloneDescriptor(descriptor)
    };
  }

  listDescriptors(): RuntimeDescriptor[] {
    return [...this.descriptors.values()].map(cloneDescriptor);
  }

  domains(): string[] {
    return [...this.runtimes.keys()];
  }
}
