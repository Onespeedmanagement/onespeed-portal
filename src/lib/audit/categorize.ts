// Sorts Amazon items and card / bank payees into categories. Your own rules
// (Audit → Categories) are checked first; these built-in ones are the fallback.

export type Rule = { pattern: string; category: string };

// Amazon items (by title)
const ITEM_RULES: [RegExp, string][] = [
  [/air fresh|febreze|glade|odor|deodori[sz]|scent/i, 'Air fresheners'],
  [/trash bag|garbage bag|can liner|paper towel|toilet (paper|tissue)|bath tissue|facial tissue|napkin dispenser|clean|wipe|disinfect|bleach|lysol|clorox|mop|broom|dust ?pan|sanitiz|hand soap|soap|glove|degreas|windex|scrub|sponge|squeegee|vacuum|swiffer|janitor|urinal|toilet bowl|floor (cleaner|mat)/i, 'Cleaning & janitorial'],
  [/receipt|thermal (paper|roll)|register roll|pos paper|ink|toner|cartridge|label|sharpie|marker|pen\b|pens\b|stapl|copy paper|printer paper|envelope|folder|binder|notebook|post-?it|sticky note|calculator|price gun|tag gun|rubber band|clipboard|scissors|tape dispenser|file box|desk/i, 'Register, paper & office'],
  [/wine bag|bottle bag|gift bag|tissue paper|shopping bag|t-?shirt bag|plastic bag|paper bag|tote|bags?\b|bubble wrap|packing tape|shipping box|carton|shrink wrap|stretch wrap/i, 'Bags & packaging'],
  [/candy|chips|snack|gum\b|jerky|nuts\b|chocolate|mints|lighter|rolling paper|cigar|hookah|vape|cooler bag|corkscrew|wine opener|bottle opener|shot glass|flask|koozie/i, 'Resale: snacks & accessories'],
  [/mixer|bitters|grenadine|simple syrup|margarita mix|energy drink|soda|seltzer water|tonic|club soda|bottled water|juice|ice\b/i, 'Resale: drinks & mixers'],
  [/sign|banner|display|chalk ?board|easel|poster|shelf talker|price tag holder|acrylic|sale tag|label holder|stand\b/i, 'Displays & signage'],
  [/shelv|shelf|rack|cart\b|dolly|hand truck|ladder|step stool|fixture|refrigerat|freezer|cooler\b|scanner|barcode|monitor|camera|security cam|tablet|ipad|cable|charger|batter(y|ies)|light ?bulb|led\b|extension cord|power strip|surge|router|wifi|printer\b|cash drawer|safe\b|scale\b|fan\b|heater|space heater/i, 'Store equipment'],
  [/coffee|k-?cup|creamer|sugar|plates|cups|utensil|fork|spoon|paper plate|breakroom|tea\b|water cooler|microwave|keurig/i, 'Breakroom'],
  [/first aid|fire extinguish|safety|vest|smoke detector|bandage|ice melt|salt\b|snow shovel|non-?slip|wet floor/i, 'Safety & facility'],
  [/screw|drill|hammer|wrench|tool|caulk|paint|glue|zip tie|hook|bracket|lock\b|padlock|key\b|hinge|plumb|faucet|filter\b|hvac/i, 'Maintenance & tools'],
];

// Card and bank payees
const VENDOR_RULES: [RegExp, string][] = [
  [/chase credit card|credit card (payment|pmt)|card payment|amex|american express|capital one|discover card|citi card/i, 'Card payments (see Chase tab)'],
  [/payment al+i+c?ance|merchant (services|fees|bankcard)|card process|worldpay|heartland pay|elavon|first data|fiserv|global payments|tsys|payment ?tech/i, 'Card processing fees'],
  [/payroll|harish parappa|adp\b|paychex|gusto|intuit quickbooks workforce|workforce/i, 'Payroll'],
  [/breakthru|southern (wine|glazer)|republic national|\brndc\b|\bnks\b|standard distrib|prime beverage|prestige|winebow|kymp|kyp inc|ebright|import|snack|jerky|chips|candy|opici|other ?side distrib|vintage import|dmv distrib|coca[- ]?cola|pepsi|monsieur touton|metro beverage|baltimore beverage|herr'?s|s&l distrib|first state distrib|alan'?s distrib|alans distrib|canada dry|holt'?s|ice butler|distribut|beverage|wine & spirits|beer co|brewing|winery/i, 'Inventory / distributors'],
  [/waste management|\bwm\b.*(waste|ezpay)|republic services|gfl|trash|waste|disposal|rumpke|casella|recycl|dumpster|hauling/i, 'Trash & recycling'],
  [/verizon|comcast|xfinity|at&t|\batt\b|t-?mobile|spectrum|cox comm|frontier|ringcentral|ooma|internet|telecom|broadband|fios|wireless|phone/i, 'Phone & internet'],
  [/indeed|backgroundchecks|background check|ziprecruiter|when i work|homebase|hiring|checkr/i, 'Hiring & staff tools'],
  [/\badt\b|everon|alarm|brinks|vector security|guardian|simplisafe|vivint|monitoring|security system|protection one|stanley security|allied universal/i, 'Alarm & security'],
  [/orkin|terminix|pest|rentokil|aptive|ehrlich|bug|exterminat/i, 'Pest control'],
  [/delmarva|electric|power\b|pseg|pepco|\bbge\b|exelon|artesian|water (co|dept|authority|util)|suez|veolia|\bgas (co|company|util)|chesapeake util|energy\b|utility/i, 'Utilities'],
  [/insurance|hanover|state farm|geico|travelers|hartford|progressive|liberty mutual|nationwide|erie\b|chubb|cna\b/i, 'Insurance'],
  [/fusco|churchmans place|landlord|rent\b|lease|property|realty|management co|plaza|place llc|route one llc|center llc/i, 'Rent & property'],
  [/sba\b|loan|wsfs bank|mortgage|finance charge|interest/i, 'Loans & bank'],
  [/\bllp\b|attorney|law (firm|office)|\bcpa\b|accounting|bookkeep|tax prep|consult|, pa\b|\bp\.?a\.?$/i, 'Professional fees'],
  [/facebook|facebk|meta ads|google \*?ads|yelp|advert|marketing|print(ing)?\b|vistaprint|flyer|insta signs|signs plus|customink/i, 'Advertising & signs'],
  [/loopnet|costar|crexi/i, 'Real estate listings'],
  [/quickbooks|intuit|microsoft|vercel|amazon prime|google|adobe|dropbox|zoom|canva|shopify|square|clover|toast|godaddy|wix|squarespace|mailchimp|docusign|slack|apple\.com|icloud|subscription|\.com\/bill|software|saas/i, 'Software & subscriptions'],
  [/amazon|amzn|staples|office ?depot|walmart|target|costco|sam'?s club|bj'?s|uline|webstaurant|restaurant depot|home depot|lowe'?s|dollar (tree|general)|five below/i, 'Supplies & retail'],
  [/state of|div(ision)? of revenue|tax\b|irs\b|license|abc\b|alcohol.*commission|permit|dmv\b|registration fee/i, 'Taxes & licenses'],
  [/plumb|hvac|electrician|repair|maint|landscap|snow|construction|contract(or|ing)|roof|glass|locksmith|handyman/i, 'Repairs & maintenance'],
  [/shell\b|exxon|mobil|\bbp\b|sunoco|wawa|royal farms|speedway|gulf\b|citgo|fuel|gas station|ez ?pass|parking|toll/i, 'Fuel, tolls & parking'],
  [/restaurant|doordash|grubhub|uber ?eats|mcdonald|starbucks|dunkin|pizza|grill|diner|cafe|bar & grill|chipotle|panera|subway|wendy|chick-?fil|taco/i, 'Meals'],
  [/hobby|hobbies|garden|greenhouse|etsy|nizuc|resort|\bspa\b|hot tub|sauna|baltic leisure|bmw|lexus|mercedes|audi|porsche|tesla|toyota of|honda of|golf|country club|union league|jewel|walgreens|cvs\b|netflix|spotify|hulu|disney\+?|max\.com|hbo|paramount|peacock|playstation|xbox|nintendo|steam|apple music|sephora|ulta|nike|macy|kohl|nordstrom|marshalls|tj ?maxx|amazon prime video|airbnb|hotel|marriott|hilton|expedia|airline|delta air|united air|american air|southwest|\buber\b|\blyft\b|venmo|cash ?app|zelle|paypal \*?[a-z]/i, 'Personal or unclear'],
  [/fee\b|service charge|overdraft|nsf|wire fee/i, 'Bank & card fees'],
];

// Owners and partners: payments to them aren't expenses
const OWNERS = /ujash|vrajesh|onespeed|one speed/i;

// internal = names of our own stores/companies: money moved between them isn't an expense
export function categorize(source: 'amazon' | 'chase' | 'register', vendor: string | null, item: string | null, rules: Rule[], internal: string[] = []): string {
  const hay = `${vendor ?? ''} ${(item ?? '').replace(/\[[^\]]*\]\s*$/, '')}`;   // the [category] from Chase / QuickBooks is handled below
  const hint = (item ?? '').match(/\[([^\]]+)\]\s*$/)?.[1]?.toLowerCase();
  for (const r of rules) if (r.pattern && hay.toLowerCase().includes(r.pattern.toLowerCase())) return r.category;
  if (source === 'amazon') {
    for (const [re, c] of ITEM_RULES) if (re.test(item ?? '')) return c;
    return 'Other Amazon';
  }
  if (OWNERS.test(vendor ?? '') || internal.some((n) => n && (vendor ?? '').toLowerCase().includes(n.toLowerCase()))) return 'Owners & transfers';
  if (/chase credit c|credit card (payment|pmt)|card payment|crd epay|amex|american express|capital one/i.test(hay)) return 'Card payments (see Chase tab)';
  // QuickBooks account the bookkeeper already chose (bank register)
  if (source === 'register' && hint) {
    const qb: [RegExp, string][] = [[/rent|lease|cam\b/, 'Rent & property'], [/credit card processing|merchant/, 'Card processing fees'], [/utilit|electric|water\b|gas\b/, 'Utilities'],
      [/insurance/, 'Insurance'], [/purchase|inventory|cost of goods|cogs/, 'Inventory / distributors'], [/payroll|wages|salar|ira\b|401|benefit/, 'Payroll'],
      [/bank (service|charge)|bank fee/, 'Bank & card fees'], [/repair|maint/, 'Repairs & maintenance'], [/advertis|marketing/, 'Advertising & signs'],
      [/legal|professional|accounting/, 'Professional fees'], [/telephone|phone|internet/, 'Phone & internet'], [/waste|trash|garbage/, 'Trash & recycling'],
      [/security|alarm/, 'Alarm & security'], [/tax|licen|permit/, 'Taxes & licenses'], [/owner|draw|distribution|equity/, 'Owners & transfers'], [/loan|interest|note payable/, 'Loans & bank'],
      [/software|subscription|dues/, 'Software & subscriptions'], [/supplies/, 'Supplies & retail']];
    const hit = qb.find(([re]) => re.test(hint));
    // a specific service vendor (e.g. Verizon under "Utilities") still gets its own service line
    const specific = VENDOR_RULES.find(([re]) => re.test(hay));
    if (hit && !(specific && ['Phone & internet', 'Trash & recycling', 'Alarm & security', 'Pest control', 'Card processing fees'].includes(specific[1]))) return hit[1];
  }
  for (const [re, c] of VENDOR_RULES) if (re.test(hay)) return c;
  // Chase's own category, when nothing above matched
  if (hint && source === 'chase') {
    const map: [RegExp, string][] = [[/food|drink|restaurant/, 'Meals'], [/^gas/, 'Fuel, tolls & parking'], [/automotive/, 'Vehicle'], [/repair|maintenance/, 'Repairs & maintenance'], [/office|shipping/, 'Office & shipping'], [/merchandise|inventory/, 'Supplies & retail'], [/entertainment|travel|personal|health|gift|donation|education/, 'Personal or unclear'],
      [/shopping|groceries|home/, 'Supplies & retail'], [/fee/, 'Bank & card fees'], [/professional/, 'Professional fees'], [/bills|utilities/, 'Utilities']];
    const hit = map.find(([re]) => re.test(hint));
    if (hit && !(hit[1] === 'Repairs & maintenance' && /leisure|hot tub|spa\b/i.test(vendor ?? ''))) return hit[1];
  }
  // "First Last" with no company word: almost always staff or a contractor
  if (vendor && /^[A-Z][a-z'.-]+( [A-Z]\.?)?( [A-Z][a-z'.-]+){1,2}$/.test(vendor.trim()) && !/inc|llc|corp|co\b|company|compan|imports?|wine|beer|supply|services|solutions|group|works|organi|trucking|foods?|farms?|brew/i.test(vendor)) return 'People (staff / contractors)';
  return 'Other';
}

// Store services compared across stores on the Store expenses tab
export const SERVICE_CATEGORIES = ['Trash & recycling', 'Phone & internet', 'Alarm & security', 'Pest control', 'Utilities', 'Insurance', 'Software & subscriptions', 'Real estate listings'];
// Categories that are never "spend to cut" in the summary
export const NOT_EXPENSES = ['Card payments (see Chase tab)', 'Owners & transfers', 'Inventory / distributors', 'Payroll', 'People (staff / contractors)', 'Loans & bank', 'Taxes & licenses', 'Rent & property'];
