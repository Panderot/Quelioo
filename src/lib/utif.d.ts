/** utif ships no TypeScript types; this covers only the handful of functions this project calls. */
declare module 'utif' {
  export interface UtifIfd {
    width?: number
    height?: number
    data?: Uint8Array
    [tag: string]: unknown
  }

  export function decode(buffer: ArrayBuffer): UtifIfd[]
  export function decodeImage(buffer: ArrayBuffer, ifd: UtifIfd, ifds?: UtifIfd[]): void
  export function toRGBA8(ifd: UtifIfd): Uint8Array
}
