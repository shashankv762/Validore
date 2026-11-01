/** Each durable step must return JSON data, never provider credentials. */
export type RunValidationStep = <T>(id: string, work: () => Promise<T>) => Promise<T>
export const runInlineStep: RunValidationStep = async (_id, work) => work()
