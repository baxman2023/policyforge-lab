<?php
set_time_limit(900);
header('Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$requestUri = preg_replace('#^/index\.php(?=/|\?|$)#', '', $requestUri);
if ($requestUri === '' || $requestUri[0] !== '/') {
    $requestUri = '/' . ltrim($requestUri, '/');
}

$target = 'http://127.0.0.1:3138' . $requestUri;
$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');

$headers = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (in_array($lower, ['host', 'content-length', 'connection', 'accept-encoding'], true)) {
        continue;
    }
    $headers[] = $name . ': ' . $value;
}

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 900,
]);

if (!in_array($method, ['GET', 'HEAD'], true)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
if ($response === false) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'PolicyForge LAB is starting. Please refresh in a moment.';
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$rawHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);
curl_close($ch);

http_response_code($status ?: 200);
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (stripos($line, 'HTTP/') === 0 || trim($line) === '') {
        continue;
    }
    $name = strtolower(strtok($line, ':'));
    if (in_array($name, ['transfer-encoding', 'connection', 'content-encoding'], true)) {
        continue;
    }
    header($line, false);
}

echo $responseBody;
