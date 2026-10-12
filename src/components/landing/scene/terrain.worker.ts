import { runJob, type Job } from "@/lib/landing/compute";

type Request = { id: number; job: Job };
type Scope = { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };

const scope = self as unknown as Scope;

scope.onmessage = async ({ data }) => {
  try {
    const { result, transfer } = await runJob(data.job);
    scope.postMessage({ id: data.id, result }, transfer);
  } catch (err) {
    scope.postMessage({ id: data.id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
