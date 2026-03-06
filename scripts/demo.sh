#!/bin/bash

API_URL="${LOGFLOW_URL:-https://logflow-prod-func.azurewebsites.net}/api/logs"
API_KEY="${LOGFLOW_API_KEY:?Set LOGFLOW_API_KEY environment variable}"

send_log() {
  curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$1" > /dev/null
  echo "[$(date +%H:%M:%S)] Sent: $2"
}

echo "=== LogFlow Demo Simulator ==="
echo "Simulating 3 microservices..."
echo ""

# payment-service logs
send_log '{"appId":"payment-service","level":"info","message":"Payment processed successfully","metadata":{"orderId":"ORD-1001","amount":149.99,"currency":"EUR"}}' "payment-service [info]"
send_log '{"appId":"payment-service","level":"info","message":"Refund initiated","metadata":{"orderId":"ORD-998","amount":29.99}}' "payment-service [info]"
send_log '{"appId":"payment-service","level":"warn","message":"Payment gateway slow response","metadata":{"latencyMs":4200,"gateway":"stripe"}}' "payment-service [warn]"
send_log '{"appId":"payment-service","level":"error","message":"Payment declined - insufficient funds","metadata":{"orderId":"ORD-1002","userId":"usr-887"}}' "payment-service [error]"
send_log '{"appId":"payment-service","level":"info","message":"Daily settlement batch completed","metadata":{"totalTransactions":342,"totalAmount":28450.00}}' "payment-service [info]"

# auth-service logs
send_log '{"appId":"auth-service","level":"info","message":"User logged in","metadata":{"userId":"usr-112","method":"oauth2","provider":"google"}}' "auth-service [info]"
send_log '{"appId":"auth-service","level":"warn","message":"Multiple failed login attempts","metadata":{"userId":"usr-445","attempts":4,"ip":"192.168.1.55"}}' "auth-service [warn]"
send_log '{"appId":"auth-service","level":"error","message":"JWT token validation failed - expired token","metadata":{"userId":"usr-223","tokenAge":"86401s"}}' "auth-service [error]"
send_log '{"appId":"auth-service","level":"info","message":"Password reset requested","metadata":{"userId":"usr-331"}}' "auth-service [info]"
send_log '{"appId":"auth-service","level":"debug","message":"Token refresh successful","metadata":{"userId":"usr-112","newExpiry":"3600s"}}' "auth-service [debug]"

# order-service logs
send_log '{"appId":"order-service","level":"info","message":"Order created","metadata":{"orderId":"ORD-1003","items":3,"total":89.97}}' "order-service [info]"
send_log '{"appId":"order-service","level":"info","message":"Order shipped","metadata":{"orderId":"ORD-995","carrier":"DHL","trackingId":"DHL-8834521"}}' "order-service [info]"
send_log '{"appId":"order-service","level":"error","message":"Inventory check failed - item out of stock","metadata":{"itemId":"SKU-2241","orderId":"ORD-1004"}}' "order-service [error]"
send_log '{"appId":"order-service","level":"warn","message":"Order processing delayed","metadata":{"orderId":"ORD-1001","delayMs":12000,"reason":"payment_pending"}}' "order-service [warn]"
send_log '{"appId":"order-service","level":"info","message":"Order delivered","metadata":{"orderId":"ORD-990","deliveryTime":"2d 4h"}}' "order-service [info]"

echo ""
echo "Done! 15 logs sent across 3 services."
echo ""
echo "Wait 5 seconds for processing, then try:"
echo "  curl -s 'https://logflow-prod-func.azurewebsites.net/api/apps/payment-service/stats' -H 'Authorization: Bearer $API_KEY'"
echo "  curl -s 'https://logflow-prod-func.azurewebsites.net/api/apps/auth-service/stats' -H 'Authorization: Bearer $API_KEY'"
echo "  curl -s 'https://logflow-prod-func.azurewebsites.net/api/apps/order-service/stats' -H 'Authorization: Bearer $API_KEY'"
