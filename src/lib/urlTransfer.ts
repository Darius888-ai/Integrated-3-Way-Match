export const encodePayload = (data: any): string => {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const decodePayload = (encoded: string): any => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
};

export const isPayloadTooLarge = (payload: any, limit: number = 2000): boolean => {
  const encoded = encodePayload(payload);
  return encoded.length > limit;
};
