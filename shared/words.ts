// Common English words, lowercase, no punctuation (in the spirit of Monkeytype's "english" list).
export const WORDS = `the be of and a to in he have it that for they with as not on she at by this we you do
but from or which one would all will there say who make when can more if no man out other so what time up go
about than into could state only new year some take come these know see use get like then first any work now
may such give over think most even find day also after way many must look before great back through long where
much should well people down own just because good each those feel seem how high too place little world very
still nation hand old life tell write become here show house both between need mean call develop under last
right move thing general school never same another begin while number part turn real leave might want point form
off child few small since against ask late home interest large person end open public follow during present
without again hold govern around possible head consider word program problem however lead system set order eye
plan run keep face fact group play stand increase early course change help line city put close case force meet
once water upon war build hear light unite live every country bring center let side try provide continue name
certain power pay result question study woman member until far night always service away report something company
week church toward start social room figure nature though young less enough almost read include president nothing
yet better big boy cost business value second why clear expect family complete act sense mind experience art next
near direct car law industry important girl god several matter usual rather per often kind among white reason`
  .split(/\s+/)
  .filter(Boolean);

export function randomWords(count: number, rng: () => number = Math.random): string {
  const out: string[] = [];
  let prev = '';
  while (out.length < count) {
    const w = WORDS[Math.floor(rng() * WORDS.length)]!;
    if (w === prev) continue;
    out.push(w);
    prev = w;
  }
  return out.join(' ');
}
