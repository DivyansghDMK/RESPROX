import * as P from './bleProtocol.js';
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra)); };

console.log('\n== 1. Spec worked example: CPAP #1 UPDATE (App→Machine) ==');
const cpapCmd = P.buildUpdate({ modeId: P.MODE_ID.CPAP, values: { pressure: 12.5, ramp: 20 }, deviceType: P.DEVICE_TYPE.CPAP });
ok('bytes match spec', P.toHex(cpapCmd) === 'E8 00 02 01 01 7D 14 83 8E', P.toHex(cpapCmd));
ok('length 9', cpapCmd.length === 9);

console.log('\n== 2. Spec worked example: CPAP #1 ACK (Machine→App) ==');
ok('ack matches spec', P.toHex(P.buildAck(cpapCmd)) === 'E8 01 02 01 01 7D 14 82 8E', P.toHex(P.buildAck(cpapCmd)));

console.log('\n== 3. Spec worked example: BiPAP #4_ST UPDATE ==');
const st = P.buildUpdate({ modeId: P.MODE_ID.ST, deviceType: P.DEVICE_TYPE.BIPAP,
  values: { ipap: 18.0, epap: 11.0, startEpap: 12.5, backupRate: 12, tMin: 0.5, tMax: 2.0, sens: 4, riseTime: 400 } });
ok('length 18', st.length === 18, st.length);
ok('payload bytes match spec (CK aside)', P.toHex(st).startsWith('E8 00 02 02 04 00 B4 00 6E 00 7D 0C 05 14 04 08'), P.toHex(st));
console.log('    ours:', P.toHex(st), '| spec stated CK 0x56, correct is 0x5A');

console.log('\n== 4. NACK ==');
ok('nack matches spec', P.toHex(P.buildNack(P.PACKET_TYPE.UPDATE, P.NACK_REASON.CHECKSUM)) === 'E8 03 02 01 E8 8E');

console.log('\n== 5. FULL_SYNC CPAP — length + structure ==');
const sync = P.buildFullSync({ deviceType: P.DEVICE_TYPE.CPAP, mode: P.MODE.CPAP, settings: {
  cpap: { pressure: 10.0 }, auto: { minPressure: 5.0, maxPressure: 20.0, aflex: 2 }, shared: { ramp: 15 },
  config: { year: 25, month: 6, day: 25, datePad: 0, hour: 9, minute: 30, second: 0, reset: false } } });
ok('70 bytes', sync.length === 70, sync.length);
ok('header E8 01 01 01', P.toHex(sync.slice(0,4)) === 'E8 01 01 01');
ok('bytes 4-8 = 64 32 C8 0F 02', P.toHex(sync.slice(4,9)) === '64 32 C8 0F 02', P.toHex(sync.slice(4,9)));
ok('bytes 9-59 all zero on CPAP', sync.slice(9,60).every(b=>b===0));
ok('DATE/TIME at 60-66', P.toHex(sync.slice(60,67)) === '19 06 19 00 09 1E 00', P.toHex(sync.slice(60,67)));
ok('end byte', sync[69] === 0x8E);
ok('self-consistent checksum', P.checksum(sync.slice(0,68)) === sync[68]);

console.log('\n== 6. FULL_SYNC BiPAP — spec example payload, byte-for-byte ==');
const bip = P.buildFullSync({ deviceType: P.DEVICE_TYPE.BIPAP, mode: P.MODE.S, settings: {
  cpap:{pressure:10.0}, auto:{minPressure:5.0,maxPressure:20.0,aflex:2}, shared:{ramp:15},
  s:{ipap:16.0,epap:10.0,startEpap:12.0,tMin:0.5,tMax:1.5,sens:3,riseTime:300},
  st:{ipap:16.0,epap:10.0,startEpap:12.0,backupRate:10,tMin:0.5,tMax:1.5,sens:3,riseTime:300},
  t:{ipap:16.0,epap:10.0,startEpap:12.0,respiRate:12,tMin:0.5,riseTime:300},
  vaps:{maxIpap:18.0,minIpap:10.0,epap:10.0,respiRate:12,tMin:0.5,tMax:1.5,sens:3,riseTime:300,height:170,tidalVolume:500},
  comfort:{rampTime:20,humidifier:3,tubeType:1,maskType:2},
  options:{iMode:true,leakAlert:false,sleepMode:true},
  config:{year:25,month:6,day:25,datePad:0,hour:9,minute:30,second:0,reset:false} } });
const SPEC_BIPAP = P.fromHex('E8 01 02 03 64 32 C8 0F 02 00 A0 00 64 00 78 05 0F 03 06 00 A0 00 64 00 78 0A 05 0F 03 06 00 A0 00 64 00 78 0C 05 06 00 B4 00 64 00 64 0C 05 0F 03 06 AA 01 F4 14 03 01 02 01 00 01 19 06 19 00 09 1E 00 00 24 8E');
ok('70 bytes', bip.length === 70, bip.length);
ok('bytes 0-67 identical to spec example', bip.slice(0,68).every((b,i)=>b===SPEC_BIPAP[i]));
console.log('    our CK 0x' + bip[68].toString(16).toUpperCase() + ' | spec stated 0x24 (spec error)');

console.log('\n== 7. Round-trip: build -> parse -> values preserved ==');
const rt = P.parseFullSync(bip);
ok('mode S', rt.modeName === 'S');
ok('device BIPAP', rt.deviceTypeName === 'BIPAP');
ok('S ipap 16.0', rt.settings.s.ipap === 16.0, rt.settings.s.ipap);
ok('S riseTime 300ms', rt.settings.s.riseTime === 300, rt.settings.s.riseTime);
ok('S tMax 1.5s', rt.settings.s.tMax === 1.5, rt.settings.s.tMax);
ok('VAPS tidal 500ml', rt.settings.vaps.tidalVolume === 500, rt.settings.vaps.tidalVolume);
ok('VAPS height 170', rt.settings.vaps.height === 170);
ok('shared ramp 15', rt.settings.shared.ramp === 15);
ok('options iMode true / leak false', rt.settings.options.iMode === true && rt.settings.options.leakAlert === false);
const rtu = P.parseUpdate(st);
ok('UPDATE round-trip ipap 18', rtu.values.ipap === 18.0);
ok('UPDATE round-trip riseTime 400', rtu.values.riseTime === 400);
ok('UPDATE dir App→Machine', rtu.dirName === 'App→Machine');
ok('ACK detected', P.parseUpdate(P.buildAck(st)).isAck === true);

console.log('\n== 8. Dispatch discriminates FULL_SYNC vs UPDATE-ACK (both start E8 01 02) ==');
const ackBip = P.buildAck(st);
ok('ambiguous prefix confirmed', P.toHex(bip.slice(0,3)) === 'E8 01 02' && P.toHex(ackBip.slice(0,3)) === 'E8 01 02');
ok('FULL_SYNC dispatched right', P.parsePacket(bip).packet.packetType === P.PACKET_TYPE.FULL_SYNC);
ok('UPDATE ACK dispatched right', P.parsePacket(ackBip).packet.packetType === P.PACKET_TYPE.UPDATE);

console.log('\n== 9. Validation & error handling ==');
const corrupt = Uint8Array.from(bip); corrupt[10] ^= 0xFF;
const res = P.parsePacket(corrupt);
ok('corrupt packet rejected', res.ok === false);
ok('returns a NACK to send', res.nack && P.toHex(res.nack).startsWith('E8 03'), res.nack && P.toHex(res.nack));
ok('NACK reason = checksum', P.parseNack(res.nack).reason === P.NACK_REASON.CHECKSUM);
let threw = null;
try { P.buildUpdate({ modeId: P.MODE_ID.CPAP, values: { pressure: 25.0, ramp: 10 } }); } catch (e) { threw = e; }
ok('out-of-range pressure refused', threw !== null, threw?.message);
ok('  with OUT_OF_RANGE reason', threw?.reason === P.NACK_REASON.OUT_OF_RANGE);
let threw2 = null;
try { P.buildUpdate({ modeId: 0x0A, values: {} }); } catch (e) { threw2 = e; }
ok('invalid mode id refused', threw2?.reason === P.NACK_REASON.INVALID_MODE);
let threw3 = null;
try { P.buildUpdate({ modeId: P.MODE_ID.AUTO, values: { minPressure: 5, maxPressure: 20 } }); } catch (e) { threw3 = e; }
ok('missing field refused', threw3 !== null, threw3?.message);

console.log('\n== 10. Packet sizes match the spec quick-reference table ==');
const sizes = { [P.MODE_ID.CPAP]:9, [P.MODE_ID.AUTO]:11, [P.MODE_ID.S]:17, [P.MODE_ID.ST]:18, [P.MODE_ID.T]:16, [P.MODE_ID.VAPS]:21, 7:11, 8:10, 9:15 };
const vals = {
  [P.MODE_ID.CPAP]:{pressure:10,ramp:15}, [P.MODE_ID.AUTO]:{minPressure:5,maxPressure:20,ramp:15,aflex:2},
  [P.MODE_ID.S]:{ipap:16,epap:10,startEpap:12,tMin:0.5,tMax:1.5,sens:3,riseTime:300},
  [P.MODE_ID.ST]:{ipap:16,epap:10,startEpap:12,backupRate:10,tMin:0.5,tMax:1.5,sens:3,riseTime:300},
  [P.MODE_ID.T]:{ipap:16,epap:10,startEpap:12,respiRate:12,tMin:0.5,riseTime:300},
  [P.MODE_ID.VAPS]:{maxIpap:18,minIpap:10,epap:10,respiRate:12,tMin:0.5,tMax:1.5,sens:3,riseTime:300,height:170,tidalVolume:500},
  7:{rampTime:20,humidifier:3,tubeType:1,maskType:2}, 8:{iMode:true,leakAlert:false,sleepMode:true},
  9:{year:25,month:6,day:25,datePad:0,hour:9,minute:30,second:0,reset:false},
};
for (const [id, want] of Object.entries(sizes)) {
  const got = P.buildUpdate({ modeId: Number(id), values: vals[id] }).length;
  ok(`mode 0x0${id} = ${want} bytes`, got === want, `got ${got}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
