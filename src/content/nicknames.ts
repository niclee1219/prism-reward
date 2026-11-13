const FIRST = ['Crispy', 'Kopi', 'Teh', 'Spicy', 'Shiok', 'Garing', 'Kaya', 'Sambal', 'Milo', 'Atas', 'Chili', 'Steamy', 'Golden', 'Lemak', 'Wok Hei'];
const SECOND = ['Prata', 'Peng', 'Tarik', 'Laksa', 'Satay', 'Bao', 'Toast', 'Rojak', 'Dinosaur', 'Popiah', 'Crab', 'Dumpling', 'Curry Puff', 'Kueh', 'Hokkien Mee'];

export function suggestNickname(rng: () => number = Math.random): string {
  const pick = (a: string[]) => a[Math.floor(rng() * a.length)];
  for (let i = 0; i < 20; i++) {
    const name = `${pick(FIRST)} ${pick(SECOND)}`;
    if (name.length <= 16) return name;
  }
  return 'Kopi Peng';
}
