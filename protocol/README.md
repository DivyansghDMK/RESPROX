# CPAP / BiPAP BLE hex protocol — Rev 3.1

A reference implementation of the DeckMount device wire protocol: builds and
parses `FULL_SYNC`, `UPDATE` and `NACK` packets, with XOR checksums, range
validation and engineering-unit conversion.

**This is not used by the web app.** The browser talks only to the server, and
the server talks to devices — so this lives here for whoever owns the server or
firmware side to lift directly.

```
node protocol/bleProtocol.test.mjs     # 47 assertions, no dependencies
```

## Errors found in the Rev 3.1 specification

The byte map is internally consistent and the codec matches it exactly; three
of the document's hand-written worked examples do not:

| Example | Stated | Correct |
|---|---|---|
| CPAP FULL_SYNC | 72 bytes, `CK 0x60` | 70 bytes, `CK 0x6B` (two extra `00` padding bytes) |
| BiPAP FULL_SYNC | `CK 0x24` | `CK 0x2F` |
| BiPAP `#4_ST` UPDATE | `CK 0x56` (ACK `0x57`) | `CK 0x5A` (ACK `0x5B`) — the XOR stops before SENS and RISE_TIME |

The CPAP `#1` UPDATE, its ACK, and the NACK example all validate, which
confirms the checksum rule itself.

Two further ambiguities, both resolved in code with comments:

- **`MASK_TYPE` range.** The protocol says 1–2; the settings screen defines
  three masks and the protocol's `TUBE_TYPE` is 1–3 while that screen offers
  two tubes — the two rows look transposed. The codec accepts 1–3.
- **`RISE_TIME`.** The "valid" list is `100,150,350,450,500,650 ms`, but the
  spec's own worked example uses `300 ms`. The codec accepts any multiple of
  50 ms in 100–650, matching the stated range.

## Packet discrimination

`FULL_SYNC` has no DIR byte, so byte 1 is its packet type `0x01` — identical to
an `UPDATE` ACK whose DIR is `0x01`. Byte 2 does not separate them either
(device type BIPAP and packet type UPDATE are both `0x02`). **Length is the
only reliable discriminator**, which is what `parsePacket` uses.
