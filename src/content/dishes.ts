// The three recipes the player has taken over. Each correct gate recovers the next step.
// The old notes are deliberately vague, like undocumented code; PRISM's version is the
// decoded, specific step. DRAFT: a human who actually cooks should check the decoded steps.
// No recipe may use pork or lard.
import { SCORING } from '../config';

export type DishId = 'chicken-rice' | 'nasi-lemak' | 'laksa';

export interface RecipeStep {
  emoji: string;
  ingredient: string;
  /** What the old notes actually say. */
  note: string;
  /** What PRISM decoded it to. */
  decoded: string;
}

export interface Dish {
  id: DishId;
  name: string;
  emoji: string;
  /** Accent colour for the stall sign and UI. */
  colour: string;
  blurb: string;
  steps: RecipeStep[];
}

export const DISHES: Dish[] = [
  {
    id: 'chicken-rice',
    name: 'Chicken Rice',
    emoji: '🍗',
    colour: '#f4a261',
    blurb: 'Silky poached chicken, fragrant rice.',
    steps: [
      { emoji: '🐔', ingredient: 'Whole chicken', note: 'Chicken. The good one.', decoded: '1.6 kg kampung chicken, rubbed with salt.' },
      { emoji: '🫚', ingredient: 'Ginger', note: 'Ginger inside. Enough lah.', decoded: 'Stuff with 5 slices ginger and 2 stalks spring onion.' },
      { emoji: '🍲', ingredient: 'Poaching', note: 'Cook until it smells right.', decoded: 'Poach just below a simmer for 40 min.' },
      { emoji: '🧊', ingredient: 'Ice bath', note: 'Then shock it.', decoded: 'Plunge into ice water for 10 min for silky skin.' },
      { emoji: '🍚', ingredient: 'Rice', note: 'Rice in the fat. Same as always.', decoded: 'Fry rice in chicken fat with garlic, then cook in the stock.' },
      { emoji: '🌿', ingredient: 'Pandan', note: 'Don\'t forget the leaf!!', decoded: 'Knot 3 pandan leaves into the rice pot.' },
      { emoji: '🌶️', ingredient: 'Chilli sauce', note: 'Chilli: you know the one.', decoded: 'Blend chilli, garlic, ginger, lime and a ladle of stock.' },
      { emoji: '🥢', ingredient: 'Dark soy', note: 'Sauce on top. Not too much.', decoded: '1 tbsp dark soy, 1 tsp sesame oil, splash of stock.' },
    ],
  },
  {
    id: 'nasi-lemak',
    name: 'Nasi Lemak',
    emoji: '🍛',
    colour: '#e63946',
    blurb: 'Fragrant coconut rice with fiery sambal.',
    steps: [
      { emoji: '🍚', ingredient: 'Rice', note: 'Wash the rice. Until clean.', decoded: 'Rinse 2 cups jasmine rice 3 times, until the water runs clear.' },
      { emoji: '🥥', ingredient: 'Coconut milk', note: 'Santan, the thick one.', decoded: 'Cook the rice in 250 ml coconut milk, 250 ml water and a pinch of salt.' },
      { emoji: '🌿', ingredient: 'Pandan', note: 'Leaf inside, tie first.', decoded: 'Knot 3 pandan leaves and bury them in the rice with a slice of ginger.' },
      { emoji: '🌶️', ingredient: 'Sambal', note: 'Chilli paste. Fry long long.', decoded: 'Fry blended dried chillies, shallots and belacan on low for 20 min.' },
      { emoji: '🍯', ingredient: 'Tamarind and sugar', note: 'Sweet sour, ikut taste.', decoded: 'Stir 2 tbsp tamarind water and 1 tbsp palm sugar into the sambal.' },
      { emoji: '🐟', ingredient: 'Ikan bilis', note: 'Small fish. Must be crispy.', decoded: 'Fry 50 g dried anchovies and a handful of peanuts until golden.' },
      { emoji: '🥚', ingredient: 'Egg', note: 'Egg, not too hard.', decoded: 'Boil 1 egg for 7 min, cool it and cut it in half.' },
      { emoji: '🥒', ingredient: 'Cucumber', note: 'Something green, cooling.', decoded: 'Slice a few rounds of cucumber for the side of the plate.' },
    ],
  },
  {
    id: 'laksa',
    name: 'Laksa',
    emoji: '🥥',
    colour: '#ffb703',
    blurb: 'Rich, spicy coconut curry noodle soup.',
    steps: [
      { emoji: '🌶️', ingredient: 'Dried chillies', note: 'Soak the red ones.', decoded: 'Soak 15 dried chillies in hot water for 20 min.' },
      { emoji: '🧅', ingredient: 'Shallots', note: 'Small onions, many.', decoded: '10 shallots, peeled, into the blender.' },
      { emoji: '🍋', ingredient: 'Lemongrass', note: 'The grass one. Bottom part.', decoded: '3 stalks, white part only, sliced thin.' },
      { emoji: '🦐', ingredient: 'Dried shrimp', note: 'Little shrimp for the smell.', decoded: '3 tbsp dried shrimp, soaked and pounded.' },
      { emoji: '🟫', ingredient: 'Belacan', note: 'You know. The block.', decoded: '1 tbsp toasted belacan (shrimp paste) into the rempah.' },
      { emoji: '🥘', ingredient: 'Rempah', note: 'Fry till oil comes out.', decoded: 'Fry the paste on low for 15 min until the oil splits.' },
      { emoji: '🥥', ingredient: 'Coconut milk', note: 'Santan. Don\'t let it break.', decoded: 'Add 400 ml coconut milk; simmer, never boil hard.' },
      { emoji: '🌿', ingredient: 'Laksa leaf', note: 'Leaf on top, must have.', decoded: 'Finish with chopped laksa leaf (daun kesum).' },
    ],
  },
];

export const dishById = (id: DishId): Dish => DISHES.find((d) => d.id === id) ?? DISHES[0];
export const isDishId = (v: unknown): v is DishId => DISHES.some((d) => d.id === v);

if (DISHES.some((d) => d.steps.length !== SCORING.RECIPE_STEPS)) {
  throw new Error(`every dish needs exactly ${SCORING.RECIPE_STEPS} recipe steps`);
}
