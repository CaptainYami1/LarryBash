/**
 * wards.js — single server-side source of truth for the 16 wards of the
 * Ado-Odo/Ota Federal Constituency and their WhatsApp mobilization groups.
 *
 * The invite codes below are DUMMY placeholders. In production, replace each
 * `code` with the real invite code from chat.whatsapp.com/<code>.
 */
/* Ward names follow the official Ado-Odo/Ota Local Government list
   (adoodootalg.org.ng/about). Must stay in sync with index.html and
   db/schema.sql. */
const WARDS = [
  { name: 'Ota 1',      code: 'LB2027OtaOne0001' },
  { name: 'Ota 2',      code: 'LB2027OtaTwo0002' },
  { name: 'Ota 3',      code: 'LB2027OtaThree03' },
  { name: 'Sango',      code: 'LB2027Sango00004' },
  { name: 'Ijoko',      code: 'LB2027Ijoko00005' },
  { name: 'Atan',       code: 'LB2027Atan000006' },
  { name: 'Iju',        code: 'LB2027Iju0000007' },
  { name: 'Ilogbo',     code: 'LB2027Ilogbo0008' },
  { name: 'Ado-Odo 1',  code: 'LB2027AdoOdo1009' },
  { name: 'Ado-Odo 2',  code: 'LB2027AdoOdo2010' },
  { name: 'Ere',        code: 'LB2027Ere0000011' },
  { name: 'Alapoti',    code: 'LB2027Alapoti012' },
  { name: 'Igbesa',     code: 'LB2027Igbesa0013' },
  { name: 'Agbara 1',   code: 'LB2027Agbara1014' },
  { name: 'Agbara 2',   code: 'LB2027Agbara2015' },
  { name: 'Ketu',       code: 'LB2027Ketu000016' },
];

const WARD_NAMES = WARDS.map((w) => w.name);

/** Returns the full WhatsApp invite URL for a ward name, or null if unknown. */
function whatsappLinkFor(wardName) {
  const ward = WARDS.find((w) => w.name === wardName);
  return ward ? `https://chat.whatsapp.com/${ward.code}` : null;
}

module.exports = { WARDS, WARD_NAMES, whatsappLinkFor };
