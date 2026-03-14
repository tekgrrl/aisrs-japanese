#!/bin/bash
set -e

PROJECT="aisrs-japanese-dev"
BASE_URL="http://127.0.0.1:8080/v1/projects/$PROJECT/databases/(default)/documents"
TARGET_USER="default-user"

echo "STARTING BASH V2 SCHEMA MIGRATION"

# Helper to fetch docs
fetch_docs() {
  local col=$1
  curl -s -X GET "$BASE_URL/$col" | jq -c '.documents[]? // empty'
}

# 1. Migrate UserRoot
echo "--- Migrating UserRoot ---"
user_stats=$(curl -s -X GET "$BASE_URL/user-stats/$TARGET_USER" || echo "")
if [[ "$user_stats" != *'"error"'* && -n "$user_stats" ]]; then
  echo "Found legacy user-stats"
  # Very basic mapping in bash using jq
  new_user_root=$(echo "$user_stats" | jq "{
    fields: {
      id: { stringValue: \"$TARGET_USER\" },
      stats: { mapValue: { fields: .fields } },
      tutorContext: { mapValue: { fields: {
         frontierVocab: { arrayValue: { values: [] } },
         leechVocab: { arrayValue: { values: [] } },
         currentCurriculumNode: { stringValue: \"Foundation\" },
         allowedGrammar: { arrayValue: { values: [] } },
         weakGrammarPoints: { arrayValue: { values: [] } },
         communicationStyle: { stringValue: \"balanced\" },
         semanticWeaknesses: { arrayValue: { values: [] } },
         suggestedThemes: { arrayValue: { values: [] } }
      }}}
    }
  }")
else
  echo "No legacy stats, using defaults"
  new_user_root=$(jq -n "{
    fields: {
      id: { stringValue: \"$TARGET_USER\" },
      stats: { mapValue: { fields: {
        currentStreak: { integerValue: \"0\" },
        totalReviews: { integerValue: \"0\" },
        passedReviews: { integerValue: \"0\" }
      }}},
      tutorContext: { mapValue: { fields: {
         frontierVocab: { arrayValue: { values: [] } },
         leechVocab: { arrayValue: { values: [] } },
         currentCurriculumNode: { stringValue: \"Foundation\" },
         allowedGrammar: { arrayValue: { values: [] } },
         weakGrammarPoints: { arrayValue: { values: [] } },
         communicationStyle: { stringValue: \"balanced\" },
         semanticWeaknesses: { arrayValue: { values: [] } },
         suggestedThemes: { arrayValue: { values: [] } }
      }}}
    }
  }")
fi
curl -s -X PATCH -H "Content-Type: application/json" -d "$new_user_root" "$BASE_URL/users/$TARGET_USER?updateMask.fieldPaths=id&updateMask.fieldPaths=stats&updateMask.fieldPaths=tutorContext" >/dev/null

# 2. Knowledge Units
echo "--- Migrating KUs ---"
fetch_docs "knowledge-units" | while read -r doc; do
  id=$(echo "$doc" | jq -r '.name | split("/") | last')
  
  # Global mapping
  global_ku=$(echo "$doc" | jq "{
    fields: {
      id: { stringValue: \"$id\" },
      type: .fields.type,
      content: .fields.content,
      data: .fields.data,
      relatedUnits: (.fields.relatedUnits // { arrayValue: { values: [] } })
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$global_ku" "$BASE_URL/global-knowledge-units/$id" >/dev/null
  
  # User mapping
  user_ku=$(echo "$doc" | jq "{
    fields: {
      id: { stringValue: \"$id\" },
      userId: { stringValue: \"$TARGET_USER\" },
      kuId: { stringValue: \"$id\" },
      personalNotes: (.fields.personalNotes // { stringValue: \"\" }),
      userNotes: .fields.userNotes,
      createdAt: .fields.createdAt,
      status: (.fields.status // { stringValue: \"learning\" }),
      facet_count: (.fields.facet_count // { integerValue: \"0\" }),
      history: (.fields.history // { arrayValue: { values: [] } })
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$user_ku" "$BASE_URL/users/$TARGET_USER/user-kus/$id" >/dev/null
done

# 3. Scenarios
echo "--- Migrating Scenarios ---"
fetch_docs "scenarios" | while read -r doc; do
  id=$(echo "$doc" | jq -r '.name | split("/") | last')
  # Global Template
  global_sc=$(echo "$doc" | jq "{
    fields: {
      id: { stringValue: \"$id\" },
      title: .fields.title,
      description: .fields.description,
      difficultyLevel: .fields.difficultyLevel,
      setting: .fields.setting,
      dialogue: (.fields.dialogue // { arrayValue: { values: [] } }),
      extractedKUs: (.fields.extractedKUs // { arrayValue: { values: [] } }),
      grammarNotes: (.fields.grammarNotes // { arrayValue: { values: [] } }),
      roles: .fields.roles
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$global_sc" "$BASE_URL/scenario-templates/$id" >/dev/null

  # User Session
  user_sc=$(echo "$doc" | jq "{
    fields: {
      id: { stringValue: \"$id\" },
      userId: { stringValue: \"$TARGET_USER\" },
      templateId: { stringValue: \"$id\" },
      state: (.fields.state // { stringValue: \"encounter\" }),
      chatHistory: (.fields.chatHistory // { arrayValue: { values: [] } }),
      isObjectiveMet: (.fields.isObjectiveMet // { booleanValue: false }),
      evaluation: .fields.evaluation,
      createdAt: .fields.createdAt,
      completedAt: .fields.completedAt,
      pastAttempts: (.fields.pastAttempts // { arrayValue: { values: [] } })
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$user_sc" "$BASE_URL/users/$TARGET_USER/scenario-sessions/$id" >/dev/null
done

# 4. Questions
echo "--- Migrating Questions ---"
fetch_docs "questions" | while read -r doc; do
  id=$(echo "$doc" | jq -r '.name | split("/") | last')
  global_q=$(echo "$doc" | jq "{
    fields: {
      id: { stringValue: \"$id\" },
      kuId: .fields.kuId,
      data: .fields.data,
      createdAt: .fields.createdAt
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$global_q" "$BASE_URL/global-questions/$id" >/dev/null

  user_q=$(echo "$doc" | jq "{
    fields: {
      userId: { stringValue: \"$TARGET_USER\" },
      questionId: { stringValue: \"$id\" },
      status: (.fields.status // { stringValue: \"active\" }),
      lastUsed: .fields.lastUsed,
      previousAnswers: (.fields.previousAnswers // { arrayValue: { values: [] } })
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$user_q" "$BASE_URL/users/$TARGET_USER/question-states/$id" >/dev/null
done

# 5. Lessons
echo "--- Migrating Lessons ---"
fetch_docs "lessons" | while read -r doc; do
  kuId=$(echo "$doc" | jq -r '.fields.kuId.stringValue // (.name | split("/") | last)')
  
  # Dump lesson globals
  global_l=$(echo "$doc" | jq '{fields: .fields | del(.userId, .kuId, .personalMnemonic, .createdAt, .status)}')
  curl -s -X PATCH -H "Content-Type: application/json" -d "$global_l" "$BASE_URL/global-lessons/$kuId" >/dev/null

  user_l=$(echo "$doc" | jq "{
    fields: {
      lessonId: { stringValue: \"$kuId\" },
      userId: { stringValue: \"$TARGET_USER\" },
      kuId: { stringValue: \"$kuId\" },
      personalMnemonic: (.fields.personalMnemonic // { stringValue: \"\" })
    }
  }")
  curl -s -X PATCH -H "Content-Type: application/json" -d "$user_l" "$BASE_URL/users/$TARGET_USER/user-lessons/$kuId" >/dev/null
done

# 6. Review Facets
echo "--- Migrating Review Facets ---"
fetch_docs "review-facets" | while read -r doc; do
  uid=$(echo "$doc" | jq -r '.fields.userId.stringValue')
  if [[ "$uid" == "$TARGET_USER" ]]; then
    id=$(echo "$doc" | jq -r '.name | split("/") | last')
    curl -s -X PATCH -H "Content-Type: application/json" -d "$doc" "$BASE_URL/users/$TARGET_USER/review-facets/$id" >/dev/null
  fi
done

echo "✅ DONE"
