# EVM Gas Optimization Principles

## Core Gas Invariants
1. **Custom Errors vs Require Strings**: Use `error Unauthorized()` over `require(msg.sender == owner, "Unauthorized")` to save ~30-50 gas per revert branch.
2. **Transient Storage (EIP-1153)**: Leverage `TSTORE` and `TLOAD` for reentrancy locks and temporary multi-call buffers.
3. **Calldata vs Memory**: Pass external array and struct parameters with `calldata` to avoid allocation copies.
4. **Packed Storage Slots**: Pack consecutive `uint128`, `uint64`, `address`, `bool` types into contiguous 32-byte slots.
