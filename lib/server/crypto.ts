import { getRuntimeEnvironment } from "./runtime";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getMasterKey(): Promise<CryptoKey> {
  const encoded = getRuntimeEnvironment().CREDENTIAL_MASTER_KEY;
  if (!encoded) throw new Error("MASTER_KEY_UNAVAILABLE");
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    throw new Error("MASTER_KEY_INVALID");
  }
  if (bytes.byteLength !== 32) throw new Error("MASTER_KEY_INVALID");
  return crypto.subtle.importKey("raw", asArrayBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function additionalData(userId: string, purpose: string): Uint8Array {
  return encoder.encode(`legal-command:v1:${userId}:${purpose}`);
}

export async function encryptBytes(
  value: Uint8Array,
  userId: string,
  purpose: string,
): Promise<{ ciphertext: Uint8Array; iv: string }> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(additionalData(userId, purpose)) },
    key,
    asArrayBuffer(value),
  );
  return { ciphertext: new Uint8Array(encrypted), iv: bytesToBase64(iv) };
}

export async function decryptBytes(
  value: ArrayBuffer,
  iv: string,
  userId: string,
  purpose: string,
): Promise<Uint8Array> {
  const key = await getMasterKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(iv)), additionalData: asArrayBuffer(additionalData(userId, purpose)) },
    key,
    value,
  );
  return new Uint8Array(decrypted);
}

export async function encryptText(
  value: string,
  userId: string,
  purpose: string,
): Promise<{ ciphertext: string; iv: string }> {
  const encrypted = await encryptBytes(encoder.encode(value), userId, purpose);
  return { ciphertext: bytesToBase64(encrypted.ciphertext), iv: encrypted.iv };
}

export async function decryptText(
  ciphertext: string,
  iv: string,
  userId: string,
  purpose: string,
): Promise<string> {
  const value = base64ToBytes(ciphertext);
  const sliced = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  const plain = await decryptBytes(sliced, iv, userId, purpose);
  return decoder.decode(plain);
}

export async function sha256Hex(value: Uint8Array): Promise<string> {
  const input = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
