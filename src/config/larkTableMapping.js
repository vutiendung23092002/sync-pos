const PRODUCTION_BASE_ID = "HlQubD0ksa13z8sndtvlz2gSgVh";
const TEST_BASE_ID = "Df3WbKnmyaeUKJsphablcI8Jgeh";

const TABLE_IDS_BY_TYPE = {
  facebook_order_cd: {
    baseId: PRODUCTION_BASE_ID,
    tableIds: [
      "tbl8KcJ4BWv8RAu0",
      "tblHEhwASwPgvZWa",
      "tblaCww1RNlRCkDL",
      "tblpCa8E9vGk91RV",
      "tbl9i5XY3xKGHTea",
      "tbluTr4miKIe1Hfv",
      "tblmTyjqWWQOhUi9",
      "tbl74TFwkP4N5pTj",
      "tblyyYKCEMxcjFz2",
      "tblHaFHwCsSjEt03",
      "tblQkwNA18N5NBFE",
      "tblMocvZMBWF9hQo",
    ],
  },
  facebook_order_item_cd: {
    baseId: PRODUCTION_BASE_ID,
    tableIds: [
      "tbl26I5PxINsJDdW",
      "tblRbI1kUvdENI22",
      "tblTH8VUZYyBHt2Z",
      "tblFP8UEhxIc8W3e",
      "tblm8Wqq5OFysDNu",
      "tblJMadYIzdFgFh8",
      "tblLw9RPs31xhGH2",
      "tblY9tV0vu2t2Qxf",
      "tbl18ynXYYcQ6KQ2",
      "tblHVsmAnv0EqzVT",
      "tblNx6NI2lwDTQKQ",
      "tbl9zdyPJQ6ifkyM",
    ],
  },
  facebook_order_item_td: {
    baseId: PRODUCTION_BASE_ID,
    tableIds: [
      "tbl5n6qermZfP0n2",
      "tblTrCKq8xkCzHpj",
      "tblq69g5o7XxxBNp",
      "tbliBpzZlqYA4bmi",
      "tblqu9tryxI9FFa1",
      "tblOBwEhBqzcDrDs",
      "tblOwYRJUqJxMTeY",
      "tblKPj8wADGlDNR7",
      "tbl8vmYgktSGIeEV",
      "tblaEyiJob6tbCBM",
      "tbleTh3HjqBrhZ6c",
      "tbl0qfQj92lNpGpD",
    ],
  },
  facebook_order_td: {
    baseId: PRODUCTION_BASE_ID,
    tableIds: [
      "tblWUt2YCE1G7d3A",
      "tbloJh6cnPe8IuAR",
      "tblvDyV0so0JFB9V",
      "tblsh21Xr0TcNzYT",
      "tblAeYCMhrN2Vp1X",
      "tblcMKeF0SRzLLbF",
      "tblIFXLvFeufPpPY",
      "tblVphj0WIN9OVs1",
      "tblyZbigKS0dKMsp",
      "tbl6BHH0OyI8rIZI",
      "tblo7WAaK290X5VG",
      "tblaGJMKRrLVWAvb",
    ],
  },
  facebook_order_cd_test: {
    baseId: TEST_BASE_ID,
    tableIds: [
      "tblEFYgM1cCtlERw",
      "tbl8F1d7rd27HeKf",
      "tblvspGY13hOKdBI",
      "tblzapy4OuQ0NEsw",
      "tblJfLjX882RqxmX",
      "tbljlItuPiIL17Cv",
      "tblMVbkYhXQtHitT",
      "tblJ0r1WaYDTeGOJ",
      "tblVRbAVhcoiNd53",
      "tblpSmbusnvEZv3C",
      "tblRj5xcgp9FYM8V",
      "tblV1GICEJxwi5ni",
    ],
  },
  facebook_order_item_cd_test: {
    baseId: TEST_BASE_ID,
    tableIds: [
      "tblZl8zsv9rmcHPm",
      "tbljkF4EMc1F0U1q",
      "tbl9TVbFM7ZuncEf",
      "tblnbe0nGrAEVaEn",
      "tblzXvW4vGhncElA",
      "tblP19J3iOyFsMSW",
      "tbliu0bA3gMbMpLS",
      "tblBSbUB3A1V5s0c",
      "tblB42bVIvK8ADJz",
      "tblm3WokkfaQDzNI",
      "tblOaEvV8WPecASm",
      "tblGwN9rSQcA17M5",
    ],
  },
  facebook_order_item_td_test: {
    baseId: TEST_BASE_ID,
    tableIds: [
      "tblkmLgFn8U2LI9v",
      "tbllcH0lpbY85s8Q",
      "tblsB0urwZmStbO5",
      "tblhQyVlvqZrnaZx",
      "tblyKpn2wQFZiKAh",
      "tblyws13dXbGMXxh",
      "tblMlJuV1SUlZaOP",
      "tblbGKfKHLeSp5MH",
      "tblIh1hn1ir1lwFS",
      "tblUiFuRGD8B7o2R",
      "tblp5Kluv2x9jgoG",
      "tblie9Tk41IitEQJ",
    ],
  },
  facebook_order_td_test: {
    baseId: TEST_BASE_ID,
    tableIds: [
      "tblaNWH7hbcCu6cG",
      "tblnP28OnYqK7xPQ",
      "tbli6XkaWBv0t7mq",
      "tbl3KGdQUisnnmkd",
      "tblHwvy45o0OwLgk",
      "tbllt3kyBv3RjOuk",
      "tbloOtBYZfMmuAds",
      "tbl5DALKFm6xZb0D",
      "tblzNCP3eIGfjZ0i",
      "tblT4xMqA9xBn6WS",
      "tblkoP9MvIQ4D8i0",
      "tblDZY2r2UTaZ7UW",
    ],
  },
};

function buildConfigs(type, definition) {
  if (definition.tableIds.length !== 12) {
    throw new Error(`Lark mapping ${type} must contain exactly 12 table IDs`);
  }
  return definition.tableIds.map((tableId, index) =>
    Object.freeze({
      base_id: definition.baseId,
      table_id: tableId,
      type,
      month: index + 1,
      year: null,
    }),
  );
}

export const LARK_TABLE_CONFIG_MAPPING = Object.freeze(
  Object.fromEntries(
    Object.entries(TABLE_IDS_BY_TYPE).map(([type, definition]) => [
      type,
      Object.freeze(buildConfigs(type, definition)),
    ]),
  ),
);

export function getMappedLarkTableConfigs({ type }) {
  const configs = LARK_TABLE_CONFIG_MAPPING[type];
  if (!configs) {
    throw new Error(`Missing Lark table mapping: type=${type}`);
  }
  return configs;
}

export function getMappedLarkTableConfig({ type, month }) {
  const normalizedMonth = Number(month);
  const config = getMappedLarkTableConfigs({ type }).find(
    (item) => item.month === normalizedMonth,
  );
  if (!config) {
    throw new Error(
      `Missing Lark table mapping: type=${type}, month=${month}`,
    );
  }
  return config;
}
