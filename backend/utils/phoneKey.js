/**
 * The digits a phone number is matched on, wherever it came from.
 *
 * Keeps the last ten digits, which is the subscriber number in every format an
 * Indian agency will type: with or without the +91 country code, with or
 * without the 0 trunk prefix, with any spacing or punctuation in between.
 *
 * This lives on its own, with no mongoose import, for two reasons. The
 * importer, the single-create path and the Client pre-save hook all have to
 * agree exactly — the stored `phoneKey` is written by one of them and queried
 * by the others, so a second copy of the rule would be free to drift and the
 * only symptom would be duplicate leads quietly reappearing. And a util that
 * imports a model drags that model's compilation into anything that imports
 * the util, which in a CLI script means a schema compiled before the tenancy
 * plugin registers.
 */
export function phoneKeyOf(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * A client's phone as a buyer requirement stores it: optional leading +, then
 * digits, no leading zero — the shape the requirement's own validation accepts.
 * A client phone is free text ("+91 98765-43210", "098765 43210"), so copying it
 * across unchanged would make the requirement fail validation the next time it
 * is edited. Empty in, empty out.
 */
export function buyerPhoneOf(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${raw.startsWith('+') ? '+' : ''}${digits}` : '';
}
