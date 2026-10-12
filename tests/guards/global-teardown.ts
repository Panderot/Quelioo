import { failOnBlockedCalls } from './guard'

export default function globalTeardown(): void {
  failOnBlockedCalls()
}
