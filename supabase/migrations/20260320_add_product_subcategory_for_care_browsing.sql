alter table products
add column if not exists subcategory text;

update products
set subcategory = 'Damaged Hair'
where category in ('Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스')
  and (
    name ilike '%손상%' or name ilike '%damage%' or
    name ilike '%케라틴%' or name ilike '%keratin%' or
    name ilike '%단백질%' or name ilike '%protein%' or
    name ilike '%복구%' or name ilike '%repair%'
  )
  and (
    name ilike '%hair%' or name ilike '%scalp%' or name ilike '%shampoo%' or
    name ilike '%treatment%' or name ilike '%헤어%' or name ilike '%두피%' or
    name ilike '%샴푸%'
  );

update products
set subcategory = 'Hair Loss'
where category in ('Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스')
  and (
    name ilike '%탈모%' or name ilike '%hair loss%' or
    name ilike '%두피%' or name ilike '%scalp%' or
    name ilike '%볼륨%' or name ilike '%volume%' or
    name ilike '%모발 강화%'
  );

update products
set subcategory = 'Oily Scalp'
where category in ('Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스')
  and (
    name ilike '%지성%' or name ilike '%oily%' or
    name ilike '%딥클렌%' or name ilike '%deep clean%' or
    name ilike '%청결%' or name ilike '%sebum%'
  );

update products
set subcategory = 'Dry Scalp'
where category in ('Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스')
  and (
    name ilike '%건성%' or name ilike '%dry%' or
    name ilike '%보습%' or name ilike '%moisture%' or
    name ilike '%hydrat%'
  )
  and subcategory is null
  and (
    name ilike '%hair%' or name ilike '%scalp%' or name ilike '%shampoo%' or
    name ilike '%treatment%' or name ilike '%헤어%' or name ilike '%두피%' or
    name ilike '%샴푸%'
  );

update products
set subcategory = 'Curl & Frizz'
where category in ('Hair', 'hair', 'body_hair', '샴푸', '트리트먼트', '헤어에센스')
  and (
    name ilike '%곱슬%' or name ilike '%frizz%' or
    name ilike '%스무딩%' or name ilike '%smoothing%' or
    name ilike '%curl cream%' or name ilike '%curling%' or
    name ilike '%wave%' or name ilike '%perm%' or
    name ilike '%웨이브%' or name ilike '%컬링%' or
    name ilike '%컬크림%'
  );

update products
set subcategory = 'General'
where category in ('Hair', 'hair', '샴푸', '트리트먼트', '헤어에센스')
  and subcategory is null;

update products
set subcategory = 'General'
where category = 'body_hair'
  and subcategory is null
  and (
    name ilike '%hair%' or name ilike '%scalp%' or name ilike '%shampoo%' or
    name ilike '%treatment%' or name ilike '%헤어%' or name ilike '%두피%' or
    name ilike '%샴푸%'
  );

update products
set subcategory = 'Dry Skin'
where category in ('Body', 'body', 'body_hair', '바디로션', '바디워시')
  and (
    name ilike '%건조%' or name ilike '%dry%' or
    name ilike '%보습%' or name ilike '%moisture%' or
    name ilike '%로션%' or name ilike '%lotion%' or
    name ilike '%cream%' or name ilike '%butter%'
  )
  and (
    name ilike '%body%' or name ilike '%hand%' or name ilike '%bath%' or
    name ilike '%바디%' or name ilike '%핸드%' or name ilike '%워시%'
  );

update products
set subcategory = 'Rough Skin'
where category in ('Body', 'body', 'body_hair', '바디로션', '바디워시')
  and (
    name ilike '%각질%' or name ilike '%exfoli%' or
    name ilike '%스크럽%' or name ilike '%scrub%'
  );

update products
set subcategory = 'Sensitive Skin'
where category in ('Body', 'body', 'body_hair', '바디로션', '바디워시')
  and (
    name ilike '%민감%' or name ilike '%sensitive%' or
    name ilike '%순한%' or name ilike '%gentle%' or
    name ilike '%calming%'
  );

update products
set subcategory = 'Body Acne'
where category in ('Body', 'body', 'body_hair', '바디로션', '바디워시')
  and (
    name ilike '%여드름%' or name ilike '%acne%' or
    name ilike '%트러블%' or name ilike '%blemish%'
  );

update products
set subcategory = 'General'
where category in ('Body', 'body', '바디로션', '바디워시')
  and subcategory is null;
