import { Component, type ReactNode } from "react";

export function retryImport<T>(
  factory: () => Promise<T>,
  retries = 2,
  delayMs = 350,
): Promise<T> {
  return factory().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise<T>((resolve, reject) => {
      setTimeout(
        () => retryImport(factory, retries - 1, delayMs).then(resolve, reject),
        delayMs,
      );
    });
  });
}

export class GraphErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
