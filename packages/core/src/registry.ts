import type { Diagnostic } from "./diagnostics.js";
import type { DomainRuntime, RuntimeDescriptor } from "./runtime.js";

export interface RegistryResolveSuccess<TDocument, TOperation> {
  ok: true;
  runtime: DomainRuntime<TDocument, TOperation>;
  descriptor: RuntimeDescriptor;
}

export interface RegistryResolveFailure {
  ok: false;
  diagnostics: Diagnostic[];
}

export type RegistryResolveResult<TDocument = unknown, TOperation = unknown> =
  | RegistryResolveSuccess<TDocument, TOperation>
  | RegistryResolveFailure;

/**
 * In-memory registry of DomainRuntime instances keyed by domain id.
 * Rejects duplicate domains; unknown domains return structured diagnostics.
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
    this.runtimes.set(descriptor.domain, runtime);
    this.descriptors.set(descriptor.domain, descriptor);
    return descriptor;
  }

  async resolve<TDocument = unknown, TOperation = unknown>(
    domain: string
  ): Promise<RegistryResolveResult<TDocument, TOperation>> {
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
      runtime: runtime as DomainRuntime<TDocument, TOperation>,
      descriptor
    };
  }

  listDescriptors(): RuntimeDescriptor[] {
    return [...this.descriptors.values()];
  }

  domains(): string[] {
    return [...this.runtimes.keys()];
  }
}
