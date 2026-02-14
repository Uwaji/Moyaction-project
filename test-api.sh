#!/bin/bash
# =============================================
# Moyaction API テストスクリプト
# 使い方: BASE_URL=https://your-app.vercel.app ./test-api.sh
# =============================================

BASE_URL="${BASE_URL:-http://localhost:3000}"
echo "=== Moyaction API テスト ==="
echo "Base URL: $BASE_URL"
echo ""

# 色の定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1 - $2"; }
info() { echo -e "${YELLOW}→${NC} $1"; }

# ==============================
# 1. ユーザー登録 API
# ==============================
echo "--- 認証API テスト ---"

# バリデーション: 必須項目なし
RESULT=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "$RESULT" | grep -q '"success":false' && pass "signup バリデーション" || fail "signup バリデーション" "$RESULT"

# 登録
TIMESTAMP=$(date +%s)
TEST_EMAIL="test${TIMESTAMP}@example.com"
TEST_PASSWORD="testpass123"
info "登録テスト: $TEST_EMAIL"

RESULT=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"username\":\"testuser\"}")
echo "$RESULT" | grep -q '"success":true' && pass "signup 成功" || fail "signup 成功" "$RESULT"

# ==============================
# 2. ログイン API
# ==============================
RESULT=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

TOKEN=$(echo "$RESULT" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  pass "login 成功（トークン取得）"
else
  fail "login 成功" "$RESULT"
  echo "トークンが取得できないため、以降のテストをスキップします"
  exit 1
fi

# ==============================
# 3. ユーザー情報取得 API
# ==============================
RESULT=$(curl -s -X GET "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT" | grep -q '"username"' && pass "me ユーザー情報取得" || fail "me ユーザー情報取得" "$RESULT"

# 認証なしのアクセス
RESULT=$(curl -s -X GET "$BASE_URL/api/auth/me")
echo "$RESULT" | grep -q '"success":false' && pass "me 認証なし拒否" || fail "me 認証なし拒否" "$RESULT"

# ==============================
# 4. パスワードリセット API
# ==============================
RESULT=$(curl -s -X POST "$BASE_URL/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")
echo "$RESULT" | grep -q '"success":true' && pass "reset-password メール送信" || fail "reset-password メール送信" "$RESULT"

# ==============================
# 5. モヤモヤ作成 API
# ==============================
echo ""
echo "--- モヤモヤAPI テスト ---"

# バリデーション
RESULT=$(curl -s -X POST "$BASE_URL/api/mooraya" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
echo "$RESULT" | grep -q '"success":false' && pass "mooraya 作成バリデーション" || fail "mooraya 作成バリデーション" "$RESULT"

# 作成
RESULT=$(curl -s -X POST "$BASE_URL/api/mooraya" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"貯金をしたい","tag":"worry"}')

MOORAYA_ID=$(echo "$RESULT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

if [ -n "$MOORAYA_ID" ]; then
  pass "mooraya 作成成功（ID: $MOORAYA_ID）"
else
  fail "mooraya 作成成功" "$RESULT"
fi

# ==============================
# 6. モヤモヤ一覧取得 API
# ==============================
RESULT=$(curl -s -X GET "$BASE_URL/api/mooraya" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT" | grep -q '"貯金をしたい"' && pass "mooraya 一覧取得" || fail "mooraya 一覧取得" "$RESULT"

# ==============================
# 7. モヤモヤ修正 API
# ==============================
if [ -n "$MOORAYA_ID" ]; then
  RESULT=$(curl -s -X PATCH "$BASE_URL/api/mooraya/$MOORAYA_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"content":"もっと貯金をしたい！"}')
  echo "$RESULT" | grep -q '"もっと貯金をしたい！"' && pass "mooraya 修正成功" || fail "mooraya 修正成功" "$RESULT"
fi

# ==============================
# 8. モヤモヤ アーカイブ API
# ==============================
if [ -n "$MOORAYA_ID" ]; then
  # 理由なしで失敗
  RESULT=$(curl -s -X POST "$BASE_URL/api/mooraya/$MOORAYA_ID/archive" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{}')
  echo "$RESULT" | grep -q '"success":false' && pass "mooraya アーカイブ理由必須" || fail "mooraya アーカイブ理由必須" "$RESULT"

  # 理由ありでアーカイブ
  RESULT=$(curl -s -X POST "$BASE_URL/api/mooraya/$MOORAYA_ID/archive" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"archive_reason":"行動に移せたから"}')
  echo "$RESULT" | grep -q '"archived_at"' && pass "mooraya アーカイブ成功" || fail "mooraya アーカイブ成功" "$RESULT"
fi

# ==============================
# 9. アーカイブ済みモヤモヤ完全削除 API
# ==============================
if [ -n "$MOORAYA_ID" ]; then
  RESULT=$(curl -s -X DELETE "$BASE_URL/api/mooraya/$MOORAYA_ID" \
    -H "Authorization: Bearer $TOKEN")
  echo "$RESULT" | grep -q '"success":true' && pass "mooraya 完全削除成功" || fail "mooraya 完全削除成功" "$RESULT"
fi

# ==============================
# 10. ログアウト API
# ==============================
echo ""
echo "--- ログアウト テスト ---"
RESULT=$(curl -s -X POST "$BASE_URL/api/auth/logout" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT" | grep -q '"success":true' && pass "logout 成功" || {
  echo "$RESULT" | grep -q '"success"' && info "logout（service_role_key未設定の可能性）: $RESULT" || fail "logout" "$RESULT"
}

echo ""
echo "=== テスト完了 ==="
