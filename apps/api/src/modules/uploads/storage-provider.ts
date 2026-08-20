export type StorageObject = {
  key: string;
  bytes: Buffer;
  mimeType: string;
};

export interface StorageProvider {
  put(input: {
    bytes: Buffer;
    mimeType: string;
    extension: string;
  }): Promise<{ key: string }>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
}
