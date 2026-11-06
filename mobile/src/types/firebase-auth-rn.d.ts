// Metro resolves @firebase/auth to its React Native build, which exports
// getReactNativePersistence, but the public typings only describe the web build.
import 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
