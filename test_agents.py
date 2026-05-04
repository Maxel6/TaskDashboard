import os
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage

# 1. INITIALISATION DU MAÎTRE (30B)
# On utilise le 30B car c'est lui qui a la vision d'ensemble
master_llm = ChatOllama(model="qwen3-coder:30b", temperature=0.1)

# 2. FONCTION DE LECTURE INTELLIGENTE
def get_clean_project_content(directory="."):
    allowed_extensions = ('.py', '.js', '.ts', '.tsx', '.html', '.css', '.json')
    # ON IGNORE STRICTEMENT LES DOSSIERS LOURDS
    ignored_dirs = {
        'venv', '.venv', 'env', 'bin', 'lib', 'include', 
        '.git', '__pycache__', 'node_modules', 'dist', 'build'
    }
    
    context = ""
    file_count = 0
    
    for root, dirs, files in os.walk(directory):
        # On coupe court aux dossiers ignorés
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        
        for file in files:
            if file.endswith(allowed_extensions):
                # On évite aussi de lire le script d'agent lui-même pour ne pas boucler
                if file == "test_agents.py": continue
                
                full_path = os.path.join(root, file)
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if content.strip(): # On n'ajoute que s'il y a du contenu
                            context += f"\n--- FICHIER: {full_path} ---\n{content}\n"
                            file_count += 1
                except:
                    continue
    return context, file_count

# 3. EXÉCUTION
print("📂 Analyse du dossier TaskDashboard (en ignorant venv)...")
project_code, count = get_clean_project_content()

if count == 0:
    print("❌ Aucun fichier de code trouvé. Vérifie que tu es dans le bon dossier.")
else:
    print(f"✅ {count} fichiers lus. Envoi au CTO (30B)...")
    
    prompt_review = f"""
Voici le code source de mon projet TaskDashboard. 
Analyse l'architecture globale et réponds précisément :
1. DETTE TECHNIQUE : Quelle est la plus grosse faiblesse de conception ?
2. RISQUES : Vois-tu des bugs potentiels ou des failles de sécurité ?
3. RÉFACTORISATION : Donne un plan d'action prioritaire pour améliorer ce code.

LE CODE DU PROJET :
{project_code}
"""

    print("🧠 Réflexion du 30B en cours (Analyse profonde)...")
    try:
        response = master_llm.invoke([
            SystemMessage(content="Tu es un CTO expert. Tu es direct, critique et tu cherches l'efficacité maximale."),
            HumanMessage(content=prompt_review)
        ]).content

        print("\n" + "="*50)
        print("🔍 RAPPORT DU CTO (Qwen 30B)")
        print("="*50)
        print(response)
    except Exception as e:
        print(f"❌ Erreur lors de l'analyse : {e}")