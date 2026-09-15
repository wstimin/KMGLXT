<?php
/**
 * 十夜卡密 · PHP 接入示例
 *
 * 场景:顾客在 xxx.com 输入卡号
 * 1) 原项目旧的「查自己的库」逻辑 → 删除,替换为下方 API 调用
 * 2) 首次成功激活 → 本系统已绑定归属;之后每次验卡/扣次都走 API
 */
require __DIR__ . '/CardApiClient.php';

// ── 配置:后台「项目管理」里领取 ──
$API = new CardApiClient(
    'https://api.your-domain.com', // 你的十夜卡密服务地址
    'XXXXXXXXXXXXXXXXXXXXXXXX',    // app_key
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' // app_secret
);

// 用户提交的卡号(服务端会自动 trim + 大写,这里也可以先规范化)
$card = strtoupper(trim($_POST['card'] ?? ''));

/** 结果码判断工具 */
function isOk($res) { return is_array($res) && $res['code'] === 0; }

if (!$card) {
    die(json_encode(['code' => 400, 'msg' => '请输入卡号']));
}

// ── 1) 激活流程:验证该卡可用并立即绑定本项目(在「注册/买课/升级」入口调用) ──
$res = $API->activate($card);
if (!isOk($res)) {
    // 2002 已被使用 / 2006 已绑定其他项目 / 2007 该项目不可用 ...
    die(json_encode(['code' => $res['code'], 'msg' => $res['message']]));
}
// 激活成功后:套餐类型 / 过期时间 / 剩余次数 / 金额卡面额
//   $res['data']['type']           => duration | times | money | permanent
//   $res['data']['expire_at']      => 时长卡: Unix 秒
//   $res['data']['remaining_times']=> 次数卡: 剩余次数
//   $res['data']['amount']         => 金额卡: 面额(只报面额,余额由对方平台扣)
//   $res['data']['project_id']     => 本项目 id
echo json_encode([
    'code' => 0,
    'msg' => '开通成功',
    'type' => $res['data']['type'],
    'expire_at' => $res['data']['expire_at'],
    'remaining_times' => $res['data']['remaining_times'],
    'amount' => $res['data']['amount'] ?? null,
]);

// ── 2) 日常鉴权:每次登录/访问付费内容前验一次(不改状态) ──
// $res = $API->verify($card);
// if (!isOk($res)) { /* 拒绝访问,提示 $res['message'] */ }
// else { $data = $res['data']; /* remaining_days / remaining_times / remaining_amount */ }

// ── 3) 次数卡扣减:每次消耗一次 ──
// $res = $API->consume($card, 1);
// if (!isOk($res)) { /* 2008 次数不足 / 2003 已过期 / 2010 未激活 */ }