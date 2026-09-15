<?php
/**
 * 十夜卡密 · 对接客户端(PHP)
 *
 * 依赖:PHP >= 7.4(支持 hash_hmac / curl 即可)
 * 用法:见 example.php
 */
class CardApiClient
{
    /** @var string 服务端地址,如 https://api.your-domain.com,末尾不要带 / */
    private $endpoint;

    /** @var string 后台「项目管理」领取的凭证 */
    private $appKey;
    private $appSecret;

    /** @var bool 调试时打印每次请求的签名头 */
    public $debug = false;

    public function __construct($endpoint, $appKey, $appSecret)
    {
        $this->endpoint = rtrim($endpoint, '/');
        $this->appKey = $appKey;
        $this->appSecret = $appSecret;
    }

    /**
     * 发送签名请求
     *
     * @param string $path /api/v1/card/verify 等
     * @param array $body 请求体(数组,会自动 JSON 序列化)
     * @return array 统一响应 {code, message, data},失败时抛出异常
     */
    public function request($path, array $body)
    {
        $timestamp = (string) time();
        $nonce = bin2hex(random_bytes(8)); // 16 位十六进制,足够随机
        // 注意:必须保持 JSON 字符串和将要发送的字节一致
        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $bodyHash = hash('sha256', $json);
        $sign = hash_hmac('sha256', $this->appKey . "\n" . $timestamp . "\n" . $nonce . "\n" . $bodyHash, $this->appSecret);

        $headers = [
            'Content-Type: application/json',
            'X-App-Key: ' . $this->appKey,
            'X-Timestamp: ' . $timestamp,
            'X-Nonce: ' . $nonce,
            'X-Sign: ' . $sign,
        ];

        if ($this->debug) {
            fwrite(STDERR, "[CardApi] $this->endpoint$path\n" . implode("\n", $headers) . "\nBody: $json\n");
        }

        $ch = curl_init($this->endpoint . $path);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        $raw = curl_exec($ch);
        if (curl_errno($ch)) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException("请求失败: $err");
        }
        curl_close($ch);

        $res = json_decode($raw, true);
        if (!is_array($res)) {
            throw new RuntimeException('响应解析失败: ' . substr($raw, 0, 200));
        }
        return $res;
    }

    /** 验卡 */
    public function verify($card)
    {
        return $this->request('/api/v1/card/verify', ['card' => $card]);
    }

    /** 激活绑定(一卡只成功一次) */
    public function activate($card)
    {
        return $this->request('/api/v1/card/activate', ['card' => $card]);
    }

    /** 次数卡扣减 */
    public function consume($card, $times = 1)
    {
        return $this->request('/api/v1/card/consume', ['card' => $card, 'times' => $times]);
    }

    /** 全字段查询 */
    public function query($card)
    {
        return $this->request('/api/v1/card/query', ['card' => $card]);
    }

    /** 冻结 */
    public function freeze($card)
    {
        return $this->request('/api/v1/card/freeze', ['card' => $card]);
    }

    /** 解冻 */
    public function unfreeze($card)
    {
        return $this->request('/api/v1/card/unfreeze', ['card' => $card]);
    }
}