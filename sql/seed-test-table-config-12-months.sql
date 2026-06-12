BEGIN;

DELETE FROM han_lark_base.tables_pos
WHERE type IN (
  'facebook_order_td_test',
  'facebook_order_item_td_test',
  'facebook_order_cd_test',
  'facebook_order_item_cd_test'
);

INSERT INTO han_lark_base.tables_pos (
  table_id,
  base_id,
  table_name,
  type,
  month,
  year,
  note
)
VALUES
  -- Order by creation month (TD)
  ('tblaNWH7hbcCu6cG', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T1',  'facebook_order_td_test', 1,  2026, 'Thang tao don'),
  ('tblnP28OnYqK7xPQ', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T2',  'facebook_order_td_test', 2,  2026, 'Thang tao don'),
  ('tbli6XkaWBv0t7mq', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T3',  'facebook_order_td_test', 3,  2026, 'Thang tao don'),
  ('tbl3KGdQUisnnmkd', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T4',  'facebook_order_td_test', 4,  2026, 'Thang tao don'),
  ('tblHwvy45o0OwLgk', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T5',  'facebook_order_td_test', 5,  2026, 'Thang tao don'),
  ('tbllt3kyBv3RjOuk', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T6',  'facebook_order_td_test', 6,  2026, 'Thang tao don'),
  ('tbloOtBYZfMmuAds', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T7',  'facebook_order_td_test', 7,  2026, 'Thang tao don'),
  ('tbl5DALKFm6xZb0D', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T8',  'facebook_order_td_test', 8,  2026, 'Thang tao don'),
  ('tblzNCP3eIGfjZ0i', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T9',  'facebook_order_td_test', 9,  2026, 'Thang tao don'),
  ('tblT4xMqA9xBn6WS', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T10', 'facebook_order_td_test', 10, 2026, 'Thang tao don'),
  ('tblkoP9MvIQ4D8i0', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T11', 'facebook_order_td_test', 11, 2026, 'Thang tao don'),
  ('tblDZY2r2UTaZ7UW', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_T12', 'facebook_order_td_test', 12, 2026, 'Thang tao don'),

  -- Item by creation month (TD)
  ('tblkmLgFn8U2LI9v', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T1',  'facebook_order_item_td_test', 1,  2026, 'Thang tao don item'),
  ('tbllcH0lpbY85s8Q', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T2',  'facebook_order_item_td_test', 2,  2026, 'Thang tao don item'),
  ('tblsB0urwZmStbO5', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T3',  'facebook_order_item_td_test', 3,  2026, 'Thang tao don item'),
  ('tblhQyVlvqZrnaZx', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T4',  'facebook_order_item_td_test', 4,  2026, 'Thang tao don item'),
  ('tblyKpn2wQFZiKAh', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T5',  'facebook_order_item_td_test', 5,  2026, 'Thang tao don item'),
  ('tblyws13dXbGMXxh', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T6',  'facebook_order_item_td_test', 6,  2026, 'Thang tao don item'),
  ('tblMlJuV1SUlZaOP', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T7',  'facebook_order_item_td_test', 7,  2026, 'Thang tao don item'),
  ('tblbGKfKHLeSp5MH', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T8',  'facebook_order_item_td_test', 8,  2026, 'Thang tao don item'),
  ('tblIh1hn1ir1lwFS', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T9',  'facebook_order_item_td_test', 9,  2026, 'Thang tao don item'),
  ('tblUiFuRGD8B7o2R', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T10', 'facebook_order_item_td_test', 10, 2026, 'Thang tao don item'),
  ('tblp5Kluv2x9jgoG', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T11', 'facebook_order_item_td_test', 11, 2026, 'Thang tao don item'),
  ('tblie9Tk41IitEQJ', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item T12', 'facebook_order_item_td_test', 12, 2026, 'Thang tao don item'),

  -- Order by confirmed month (CD)
  ('tblEFYgM1cCtlERw', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_1',  'facebook_order_cd_test', 1,  2026, 'Thang chot don'),
  ('tbl8F1d7rd27HeKf', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_2',  'facebook_order_cd_test', 2,  2026, 'Thang chot don'),
  ('tblvspGY13hOKdBI', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_3',  'facebook_order_cd_test', 3,  2026, 'Thang chot don'),
  ('tblzapy4OuQ0NEsw', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_4',  'facebook_order_cd_test', 4,  2026, 'Thang chot don'),
  ('tblJfLjX882RqxmX', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_5',  'facebook_order_cd_test', 5,  2026, 'Thang chot don'),
  ('tbljlItuPiIL17Cv', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_6',  'facebook_order_cd_test', 6,  2026, 'Thang chot don'),
  ('tblMVbkYhXQtHitT', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_7',  'facebook_order_cd_test', 7,  2026, 'Thang chot don'),
  ('tblJ0r1WaYDTeGOJ', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_8',  'facebook_order_cd_test', 8,  2026, 'Thang chot don'),
  ('tblVRbAVhcoiNd53', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_9',  'facebook_order_cd_test', 9,  2026, 'Thang chot don'),
  ('tblpSmbusnvEZv3C', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_10', 'facebook_order_cd_test', 10, 2026, 'Thang chot don'),
  ('tblRj5xcgp9FYM8V', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_11', 'facebook_order_cd_test', 11, 2026, 'Thang chot don'),
  ('tblV1GICEJxwi5ni', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'OD_CD_12', 'facebook_order_cd_test', 12, 2026, 'Thang chot don'),

  -- Item by confirmed month (CD)
  ('tblZl8zsv9rmcHPm', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_1',  'facebook_order_item_cd_test', 1,  2026, 'Thang chot don item'),
  ('tbljkF4EMc1F0U1q', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_2',  'facebook_order_item_cd_test', 2,  2026, 'Thang chot don item'),
  ('tbl9TVbFM7ZuncEf', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_3',  'facebook_order_item_cd_test', 3,  2026, 'Thang chot don item'),
  ('tblnbe0nGrAEVaEn', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_4',  'facebook_order_item_cd_test', 4,  2026, 'Thang chot don item'),
  ('tblzXvW4vGhncElA', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_5',  'facebook_order_item_cd_test', 5,  2026, 'Thang chot don item'),
  ('tblP19J3iOyFsMSW', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_6',  'facebook_order_item_cd_test', 6,  2026, 'Thang chot don item'),
  ('tbliu0bA3gMbMpLS', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_7',  'facebook_order_item_cd_test', 7,  2026, 'Thang chot don item'),
  ('tblBSbUB3A1V5s0c', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_8',  'facebook_order_item_cd_test', 8,  2026, 'Thang chot don item'),
  ('tblB42bVIvK8ADJz', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_9',  'facebook_order_item_cd_test', 9,  2026, 'Thang chot don item'),
  ('tblm3WokkfaQDzNI', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_10', 'facebook_order_item_cd_test', 10, 2026, 'Thang chot don item'),
  ('tblOaEvV8WPecASm', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_11', 'facebook_order_item_cd_test', 11, 2026, 'Thang chot don item'),
  ('tblGwN9rSQcA17M5', 'Df3WbKnmyaeUKJsphablcI8Jgeh', 'Item_CD_12', 'facebook_order_item_cd_test', 12, 2026, 'Thang chot don item');

COMMIT;

SELECT type, month, table_name, table_id, base_id
FROM han_lark_base.tables_pos
WHERE type IN (
  'facebook_order_td_test',
  'facebook_order_item_td_test',
  'facebook_order_cd_test',
  'facebook_order_item_cd_test'
)
ORDER BY type, month;
