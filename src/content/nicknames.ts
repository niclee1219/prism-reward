const FIRST = ['Crispy', 'Kopi', 'Teh', 'Spicy', 'Shiok', 'Garing', 'Kaya', 'Sambal', 'Milo', 'Atas', 'Chili', 'Steamy', 'Golden', 'Lemak', 'Wok Hei', 'Zesty', 'Smoky', 'Sweet', 'Salty', 'Fiery', 'Lucky', 'Sneaky', 'Jumbo', 'Mighty', 'Cheeky', 'Tikka'];
const SECOND = ['Prata', 'Peng', 'Tarik', 'Laksa', 'Satay', 'Bao', 'Toast', 'Rojak', 'Dinosaur', 'Popiah', 'Crab', 'Dumpling', 'Curry Puff', 'Kueh', 'Hokkien Mee', 'Otah', 'Mee Pok', 'Chendol', 'Murtabak', 'Wanton', 'Sotong', 'Kaya Toast', 'Nasi', 'Roti', 'Teh Si', 'Biryani'];

export function suggestNickname(rng: () => number = Math.random): string {
  const pick = (a: string[]) => a[Math.floor(rng() * a.length)];
  for (let i = 0; i < 40; i++) {
    const name = `${pick(FIRST)} ${pick(SECOND)}`;
    if (name.length <= 16) return name;
  }
  return `Kopi Peng ${Math.floor(rng() * 90 + 10)}`;
}
