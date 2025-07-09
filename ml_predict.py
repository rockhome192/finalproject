import sys
import pandas as pd
import joblib
import json
from sklearn.impute import SimpleImputer
import sys
sys.stdout.reconfigure(encoding='utf-8')

# --- Helper functions ---
def income_category(income):
    if income == 0:
        return "ไม่มีรายได้"
    elif income < 1000:
        return "น้อยมาก"
    elif income < 5000:
        return "น้อย"
    elif income < 10000:
        return "ปานกลาง"
    elif income < 15000:
        return "ปานกลางค่อนสูง"
    elif income < 30000:
        return "สูง"
    else:
        return "สูงมาก"

def get_season(month):
    if month in [11, 12, 1]:
        return "ฤดูหนาว"
    elif month in [2, 3, 4]:
        return "ฤดูร้อน"
    else:
        return "ฤดูฝน"

def age_group(age):
    if age <= 12:
        return "เด็ก"
    elif age <= 19:
        return "วัยรุ่น"
    elif age <= 39:
        return "ผู้ใหญ่ตอนต้น"
    elif age <= 59:
        return "ผู้ใหญ่ตอนกลาง"
    else:
        return "ผู้สูงอายุ"

try:
    # --- Load model and encoders ---
    model = joblib.load('./model/RDF_trained.pkl')
    ordinal_encoder = joblib.load('./model/ordinal_encoder.pkl')
    onehot_encoder = joblib.load('./model/onehot_encoder.pkl')

    # --- Read file ---
    file_path = sys.argv[1]
    df = pd.read_csv(file_path)

    # --- Feature Engineering ---

    if 'ผลการกระทำ' not in df.columns:df['ผลการกระทำ'] = None  
    
    df['ระดับรายได้'] = df['รายได้ต่อเดือน'].apply(income_category)
    df['ฤดูกาล'] = df['เดือน'].apply(get_season)
    df['ช่วงอายุ'] = df['อายุ'].apply(age_group)
    df.drop(columns=['รายได้ต่อเดือน', 'อายุ'], inplace=True)

    # --- Features ---
    numerical_features = ['ปี', 'เดือน', 'วันที่']
    ordinal_features = ordinal_encoder.feature_names_in_.tolist()
    nominal_features = onehot_encoder.feature_names_in_.tolist()

    # --- Impute numerical ---
    df[numerical_features] = SimpleImputer(strategy='most_frequent').fit_transform(df[numerical_features])

    # --- Ordinal encode ---
    df[ordinal_features] = df[ordinal_features].fillna("ไม่ระบุ")
    ordinal_encoded = pd.DataFrame(
        ordinal_encoder.transform(df[ordinal_features]),
        columns=ordinal_encoder.get_feature_names_out(),
        index=df.index
    )

    # --- Nominal encode ---
    df[nominal_features] = df[nominal_features].fillna("ไม่ระบุ")
    nominal_encoded = pd.DataFrame(
        onehot_encoder.transform(df[nominal_features]),
        columns=onehot_encoder.get_feature_names_out(),
        index=df.index
    )

    # --- Combine all features ---
    final_df = ordinal_encoded.join(nominal_encoded).join(df[numerical_features])

    # --- Match training features ---
    missing_cols = set(model.feature_names_in_) - set(final_df.columns)
    for col in missing_cols:
        final_df[col] = 0
    final_df = final_df[model.feature_names_in_]

    # --- Predict ---
    df['predict'] = model.predict(final_df)

    # --- Mapping prediction ---
    label_map = {
        0: "ไม่บาดเจ็บ",
        1: "บาดเจ็บ",
        2: "ตาย"
    }
    df['predict_label'] = df['predict'].map(label_map)

    # --- Count predictions ---
    counts = df['predict_label'].value_counts().to_dict()

    # --- Output JSON if needed ---
    result = df.reset_index(drop=True).fillna('').to_dict(orient='records')
    
    
    # predict_counts = df['predict'].value_counts().to_dict()
   # print(json.dumps({"predict_counts": predict_counts}, ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False, indent=2))  # preview 3 records

except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
