/** Default "Our story" copy, used until the owner writes their own in Admin → Settings → About. */
export const DEFAULT_STORY = [
  'Bite & Sips began with a simple belief: a good meal can turn a tired, rushed day around. We wanted a place where the food is fresh, the drinks are cold or hot exactly when they should be, and nobody has to wait around wondering where their order is.',
  'So we keep things honest. Sandwiches are made to order. Salads and shawarma are packed with fresh, colourful ingredients. Our combo packs are made for sharing, and our milk drinks are for the days that need a little extra sweetness.',
  'Whether you stop by to pick up your order or have it brought to your door, we want it to arrive on time and taste the way it should. Good food. Good mood. That is the whole idea.',
];

/** Short descriptions shown for each menu category (matched by name, case-insensitive). */
export const CATEGORY_BLURBS: Record<string, string> = {
  shawarma: 'Grilled wraps packed with seasoned meat, fresh vegetables and our signature sauce.',
  sandwiches: 'Made-to-order sandwiches on soft or toasted bread, with extras to build your own.',
  salads: 'Crisp, colourful salads with grilled chicken, boiled egg and a pot of signature sauce.',
  'salads & wraps': 'Crisp salads and grilled wraps, made fresh to order.',
  combo: 'A meal and a drink together, plus boxes made for sharing or a long meeting.',
  boxes: 'Boxes made for sharing or a long meeting.',
  'combo packages': 'A meal and a drink together, ready in one go.',
  drinks: 'Chilled milk drinks in regular and large, in strawberry and chocolate.',
  sips: 'Chilled milk drinks in regular and large.',
};

export const VALUES = [
  { title: 'Fresh, always', text: 'Crisp lettuce, ripe vegetables, freshly grilled chicken and bread that is toasted when you order it. We would rather make a little less than serve something tired.' },
  { title: 'Made to order', text: 'Your sandwich, shawarma or salad is put together after you order, not hours before. Choose your size, sides and extras and we make it the way you asked.' },
  { title: 'Honest and simple', text: 'Clear menu, clear prices. Delivery fees and minimum orders are shown before you pay, and your total at checkout is the total you pay.' },
  { title: 'On time, every time', text: 'Pick a pickup time that suits you, and follow the status of your order from the kitchen to your door.' },
];

export const PROCESS = [
  { title: 'Your order arrives', text: 'It appears on the kitchen screen the moment it is placed and paid for, with every choice and note you added.' },
  { title: 'The kitchen confirms', text: 'The team accepts the order and starts on it. You can watch the status change on your tracking page.' },
  { title: 'Cooked and packed', text: 'Everything is made fresh, checked against your order, and packed so it arrives the way it left the kitchen.' },
  { title: 'Ready or on its way', text: 'Collect it from the counter with your order number, or follow your order on the tracking page until it reaches you.' },
];
