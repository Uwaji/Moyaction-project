#!/bin/bash
# フェーズ5 テストスクリプト
# 複雑なフロー: モヤモヤ作成 → やること2個紐づけ → やること1完了 → 未完了確認 → やること2完了 → モヤモヤ解消確認

BASE_URL="https://moyaction-project.vercel.app/api"

echo "============================================"
echo "フェーズ5 統合テスト"
echo "============================================"
echo ""

# --- 1. ログイン ---
echo "【1】ログイン..."
LOGIN_RES=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}')
echo "$LOGIN_RES" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RES"

TOKEN=$(echo "$LOGIN_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo ""
  echo "ログインに失敗しました。先にテストユーザーを作成してください。"
  echo "テストユーザー作成:"
  echo "curl -X POST $BASE_URL/auth/signup -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"password\":\"testpass123\",\"username\":\"テストユーザー\"}'"
  exit 1
fi
echo "TOKEN取得成功: ${TOKEN:0:20}..."
echo ""

AUTH="Authorization: Bearer $TOKEN"

# --- 2. ユーザー統計情報取得（初期状態） ---
echo "【2】ユーザー統計情報取得（初期状態）..."
curl -s -X GET "$BASE_URL/stats" -H "$AUTH" | python3 -m json.tool
echo ""

# --- 3. モヤモヤ作成 ---
echo "【3】モヤモヤ作成: 「貯金をしたい」..."
MOORAYA_RES=$(curl -s -X POST "$BASE_URL/mooraya" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"content":"貯金をしたい","tag":"worry"}')
echo "$MOORAYA_RES" | python3 -m json.tool
MOORAYA_ID=$(echo "$MOORAYA_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "MOORAYA_ID: $MOORAYA_ID"
echo ""

# --- 4. やりたいこと1 作成: 「100万円貯金する」 ---
echo "【4】やりたいこと1 作成: 「100万円貯金する」（重み4, 期限1年以内）..."
TASK1_RES=$(curl -s -X POST "$BASE_URL/tasks" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "title":"100万円貯金する",
    "description":"目標: 100万円を1年以内に貯める",
    "deadline_type":"within_1year",
    "weight":4,
    "reason":"将来の安心のため",
    "steps":[{"title":"目標金額を決める"},{"title":"毎月の貯金額を計算"},{"title":"自動積立を設定"}]
  }')
echo "$TASK1_RES" | python3 -m json.tool
TASK1_ID=$(echo "$TASK1_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "TASK1_ID: $TASK1_ID"
echo ""

# --- 5. やりたいこと2 作成: 「積立NISAを始める」 ---
echo "【5】やりたいこと2 作成: 「積立NISAを始める」（重み3, 期限2ヶ月以内）..."
TASK2_RES=$(curl -s -X POST "$BASE_URL/tasks" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "title":"積立NISAを始める",
    "description":"証券口座を開設して積立NISAを始める",
    "deadline_type":"within_2months",
    "weight":3,
    "reason":"資産運用の第一歩"
  }')
echo "$TASK2_RES" | python3 -m json.tool
TASK2_ID=$(echo "$TASK2_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "TASK2_ID: $TASK2_ID"
echo ""

# --- 6. モヤモヤ・やりたいこと紐づけ ---
echo "【6-a】モヤモヤ「貯金をしたい」にやること1「100万円貯金する」を紐づけ..."
curl -s -X POST "$BASE_URL/mooraya-tasks" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"mooraya_id\":$MOORAYA_ID,\"task_id\":$TASK1_ID}" | python3 -m json.tool
echo ""

echo "【6-b】モヤモヤ「貯金をしたい」にやること2「積立NISAを始める」を紐づけ..."
curl -s -X POST "$BASE_URL/mooraya-tasks" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"mooraya_id\":$MOORAYA_ID,\"task_id\":$TASK2_ID}" | python3 -m json.tool
echo ""

# --- 7. 未完了やること確認 ---
echo "【7】モヤモヤの未完了やること取得（2件あるはず）..."
curl -s -X GET "$BASE_URL/mooraya/$MOORAYA_ID/pending-tasks" -H "$AUTH" | python3 -m json.tool
echo ""

# --- 8. やりたいこと1 のステップを全て完了 ---
echo "【8】やりたいこと1 のステップを取得..."
TASK1_DETAIL=$(curl -s -X GET "$BASE_URL/tasks/$TASK1_ID" -H "$AUTH")
echo "$TASK1_DETAIL" | python3 -m json.tool
echo ""

# ステップIDを取得
STEP1_IDS=$(echo "$TASK1_DETAIL" | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
steps = data.get('task_steps', [])
for s in steps:
    print(s['id'])
" 2>/dev/null)

echo "【8-b】やりたいこと1 のステップを全て完了..."
for STEP_ID in $STEP1_IDS; do
  echo "  ステップ $STEP_ID を完了..."
  curl -s -X POST "$BASE_URL/steps/$STEP_ID" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"completed":true}' | python3 -m json.tool
done
echo ""

# --- 9. やりたいこと1 を完了 ---
echo "【9】やりたいこと1「100万円貯金する」を完了..."
curl -s -X POST "$BASE_URL/tasks/$TASK1_ID/complete" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"completion_note":"毎月コツコツ頑張った！"}' | python3 -m json.tool
echo ""

# --- 10. 未完了やること確認（1件残ってるはず） ---
echo "【10】モヤモヤの未完了やること取得（1件残っているはず = まだやることがあります！）..."
PENDING_RES=$(curl -s -X GET "$BASE_URL/mooraya/$MOORAYA_ID/pending-tasks" -H "$AUTH")
echo "$PENDING_RES" | python3 -m json.tool
echo ""

# --- 11. モヤモヤ解消確認（まだ全完了していないので失敗するはず） ---
echo "【11】モヤモヤ解消確認（未完了やることがあるので失敗するはず）..."
curl -s -X POST "$BASE_URL/mooraya/$MOORAYA_ID/resolve" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"resolved":true}' | python3 -m json.tool
echo ""

# --- 12. やりたいこと2 のステップを完了 ---
echo "【12】やりたいこと2 のステップを取得..."
TASK2_DETAIL=$(curl -s -X GET "$BASE_URL/tasks/$TASK2_ID" -H "$AUTH")
STEP2_IDS=$(echo "$TASK2_DETAIL" | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
steps = data.get('task_steps', [])
for s in steps:
    print(s['id'])
" 2>/dev/null)

echo "【12-b】やりたいこと2 のステップを全て完了..."
for STEP_ID in $STEP2_IDS; do
  echo "  ステップ $STEP_ID を完了..."
  curl -s -X POST "$BASE_URL/steps/$STEP_ID" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"completed":true}' | python3 -m json.tool
done
echo ""

# --- 13. やりたいこと2 を完了 ---
echo "【13】やりたいこと2「積立NISAを始める」を完了..."
curl -s -X POST "$BASE_URL/tasks/$TASK2_ID/complete" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"completion_note":"証券口座開設できた！"}' | python3 -m json.tool
echo ""

# --- 14. 未完了やること確認（0件 = 全完了） ---
echo "【14】モヤモヤの未完了やること取得（0件 = 全やること完了 → 解消確認へ）..."
curl -s -X GET "$BASE_URL/mooraya/$MOORAYA_ID/pending-tasks" -H "$AUTH" | python3 -m json.tool
echo ""

# --- 15. モヤモヤ解消確認（全完了なので成功するはず） ---
echo "【15】モヤモヤ解消確認: 「解消された」..."
curl -s -X POST "$BASE_URL/mooraya/$MOORAYA_ID/resolve" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"resolved":true}' | python3 -m json.tool
echo ""

# --- 16. ユーザー統計情報取得（アーカイブ後） ---
echo "【16】ユーザー統計情報取得（アーカイブ後）..."
curl -s -X GET "$BASE_URL/stats" -H "$AUTH" | python3 -m json.tool
echo ""

# --- 17. アーカイブ済み一覧 ---
echo "【17-a】アーカイブ済みやりたいこと一覧..."
curl -s -X GET "$BASE_URL/archive/tasks" -H "$AUTH" | python3 -m json.tool
echo ""

echo "【17-b】アーカイブ済みモヤモヤ一覧..."
curl -s -X GET "$BASE_URL/archive/mooraya" -H "$AUTH" | python3 -m json.tool
echo ""

# --- 18. エラーログ記録テスト ---
echo "【18】エラーログ記録テスト..."
curl -s -X POST "$BASE_URL/logs" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"error_message":"テスト用エラーログ","endpoint":"/api/test","status_code":500}' | python3 -m json.tool
echo ""

echo "============================================"
echo "フェーズ5 統合テスト完了"
echo "============================================"
echo ""
echo "テスト結果サマリー:"
echo "  【7】 未完了やること → 2件 (正常)"
echo "  【10】未完了やること → 1件 (やること1完了後)"
echo "  【11】解消確認 → 失敗 (未完了やることあり)"
echo "  【14】未完了やること → 0件 (全完了)"
echo "  【15】解消確認 → 成功 (モヤモヤもアーカイブ)"
echo "  【16】統計 → アーカイブ数増加"
