<?php
// フォームからのデータ取得
$name = htmlspecialchars($_POST['name'], ENT_QUOTES, 'UTF-8');
$email = htmlspecialchars($_POST['email'], ENT_QUOTES, 'UTF-8');
$message = htmlspecialchars($_POST['message'], ENT_QUOTES, 'UTF-8');

// 保存する内容を整形
$data = "名前: $name\nメール: $email\nメッセージ: $message\n------------------\n";

// 保存するファイル名（毎回上書きせず追記）
$file = 'form_data.txt';
file_put_contents($file, $data, FILE_APPEND);

// 完了メッセージだけ表示
echo "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><title>送信完了</title></head><body>";
echo "<h2>お問い合わせありがとうございました。送信が完了しました。</h2>";
echo "</body></html>";
?>
