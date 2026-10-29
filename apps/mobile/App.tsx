import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { apiClient } from './src/api';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

type Screen = 'HOME' | 'WORKSPACE' | 'HISTORY' | 'SETTINGS' | 'AUTH';

interface Task {
  id: string;
  title: string;
  originalGoal: string;
  status: string;
  progressPercent: number;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    actualOutput?: string;
  }>;
  artifacts: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('HOME');
  const [goalText, setGoalText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('user@veloraweb.online');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await apiClient.getTasks();
      if (res?.data) {
        setHistoryTasks(res.data);
      }
    } catch (e) {
      // Offline / fallback mock handling
    }
  };

  const handleCreateTask = async () => {
    if (!goalText.trim()) {
      Alert.alert('Required', 'Please describe what you want to accomplish');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.createTask(goalText.trim());
      setActiveTask(res);
      setGoalText('');
      setCurrentScreen('WORKSPACE');
      loadHistory();
    } catch (err: any) {
      Alert.alert('Task Creation Error', err.message || 'Unable to generate workflow');
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/markdown'],
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        Alert.alert('File Attached', result.assets[0].name);
      }
    } catch (e: any) {
      Alert.alert('Pick Error', e.message);
    }
  };

  const handlePickScreenshot = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        Alert.alert('Screenshot Attached', result.assets[0].fileName || 'Image asset');
      }
    } catch (e: any) {
      Alert.alert('Screenshot Error', e.message);
    }
  };

  const handleExecuteStep = async (stepId: string) => {
    if (!activeTask) return;
    setExecutingStepId(stepId);
    try {
      await apiClient.executeStep(activeTask.id, stepId);
      const updated = await apiClient.getTask(activeTask.id);
      setActiveTask(updated);
      loadHistory();
    } catch (e: any) {
      Alert.alert('Execution Error', e.message);
    } finally {
      setExecutingStepId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f11" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>Velora</Text>
        <Text style={styles.brandSubtitle}>Task Execution Engine</Text>
      </View>

      {/* Main Body */}
      <View style={styles.content}>
        {currentScreen === 'HOME' && (
          <ScrollView style={styles.scroll}>
            <Text style={styles.heading}>What do you want to accomplish?</Text>
            <Text style={styles.subtext}>
              Turn intentions into structured workflows, real deliverables, and verified completion.
            </Text>

            <View style={styles.card}>
              <TextInput
                style={styles.textInput}
                multiline
                numberOfLines={4}
                placeholder="e.g. Help me prepare a tailored cover letter and resume summary for a Staff Engineer role..."
                placeholderTextColor="#71717a"
                value={goalText}
                onChangeText={setGoalText}
              />

              <View style={styles.attachmentRow}>
                <TouchableOpacity style={styles.attachBtn} onPress={handlePickDocument}>
                  <Text style={styles.attachBtnText}>+ PDF/Doc</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachBtn} onPress={handlePickScreenshot}>
                  <Text style={styles.attachBtnText}>+ Screenshot</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={handleCreateTask}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Synthesize Workflow &rarr;</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Templates */}
            <Text style={styles.sectionHeader}>Quick Blueprints</Text>
            <TouchableOpacity
              style={styles.templateCard}
              onPress={() => setGoalText('Analyze PDF contract for legal liabilities and draft response')}
            >
              <Text style={styles.templateTitle}>Contract Risk Analysis</Text>
              <Text style={styles.templateDesc}>Extract terms, summarize obligations, and formulate action items.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.templateCard}
              onPress={() => setGoalText('Prepare comprehensive 4-day travel itinerary with logistics and packing checklist')}
            >
              <Text style={styles.templateTitle}>Travel Logistics Suite</Text>
              <Text style={styles.templateDesc}>Structured schedule, check-in milestones, and offline checklist.</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {currentScreen === 'WORKSPACE' && (
          <ScrollView style={styles.scroll}>
            {activeTask ? (
              <View>
                <View style={styles.taskHeaderCard}>
                  <Text style={styles.taskTitle}>{activeTask.title}</Text>
                  <Text style={styles.taskStatusPill}>{activeTask.status}</Text>
                  <Text style={styles.taskGoalText}>{activeTask.originalGoal}</Text>
                </View>

                <Text style={styles.sectionHeader}>Steps ({activeTask.steps?.length || 0})</Text>
                {activeTask.steps?.map((st, i) => (
                  <View key={st.id} style={styles.stepCard}>
                    <View style={styles.stepRow}>
                      <Text style={styles.stepNumber}>0{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stepTitle}>{st.title}</Text>
                        <Text style={styles.stepDesc}>{st.description}</Text>
                      </View>
                    </View>

                    {st.actualOutput ? (
                      <View style={styles.artifactBox}>
                        <Text style={styles.artifactLabel}>Deliverable Created:</Text>
                        <Text style={styles.artifactText} numberOfLines={5}>
                          {st.actualOutput}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.runStepBtn}
                        onPress={() => handleExecuteStep(st.id)}
                        disabled={executingStepId === st.id}
                      >
                        {executingStepId === st.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.runStepBtnText}>Execute Step</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No active task in progress</Text>
            )}
          </ScrollView>
        )}

        {currentScreen === 'HISTORY' && (
          <ScrollView style={styles.scroll}>
            <Text style={styles.heading}>Task History</Text>
            {historyTasks.length === 0 ? (
              <Text style={styles.emptyText}>No saved tasks found</Text>
            ) : (
              historyTasks.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.historyCard}
                  onPress={() => {
                    setActiveTask(t);
                    setCurrentScreen('WORKSPACE');
                  }}
                >
                  <Text style={styles.historyTitle}>{t.title}</Text>
                  <Text style={styles.historyGoal} numberOfLines={2}>{t.originalGoal}</Text>
                  <Text style={styles.historyStatus}>{t.status} &bull; {t.progressPercent}% Done</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        {currentScreen === 'SETTINGS' && (
          <ScrollView style={styles.scroll}>
            <Text style={styles.heading}>Settings &amp; Subscription</Text>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Signed in as</Text>
              <Text style={styles.fieldValue}>{userEmail}</Text>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Current Plan</Text>
              <Text style={styles.planValue}>FREE TIER (50 AI Credits/Mo)</Text>

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 20 }]}
                onPress={() => Alert.alert('Upgrade', 'Upgrade to Velora Plus (₹499/mo) via veloraweb.online')}
              >
                <Text style={styles.primaryBtnText}>Upgrade to Plus</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation Tabs */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'HOME' && styles.navItemActive]}
          onPress={() => setCurrentScreen('HOME')}
        >
          <Text style={[styles.navText, currentScreen === 'HOME' && styles.navTextActive]}>Goal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'WORKSPACE' && styles.navItemActive]}
          onPress={() => setCurrentScreen('WORKSPACE')}
        >
          <Text style={[styles.navText, currentScreen === 'WORKSPACE' && styles.navTextActive]}>
            Workspace
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'HISTORY' && styles.navItemActive]}
          onPress={() => setCurrentScreen('HISTORY')}
        >
          <Text style={[styles.navText, currentScreen === 'HISTORY' && styles.navTextActive]}>
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, currentScreen === 'SETTINGS' && styles.navItemActive]}
          onPress={() => setCurrentScreen('SETTINGS')}
        >
          <Text style={[styles.navText, currentScreen === 'SETTINGS' && styles.navTextActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f11',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e33',
    backgroundColor: '#18181b',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fafafa',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#a1a1aa',
  },
  content: {
    flex: 1,
  },
  scroll: {
    padding: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 12,
    color: '#a1a1aa',
    marginBottom: 16,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#18181b',
    borderColor: '#2e2e33',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#0f0f11',
    borderColor: '#2e2e33',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: '#fafafa',
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  attachmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  attachBtn: {
    backgroundColor: '#27272a',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  attachBtnText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  templateCard: {
    backgroundColor: '#18181b',
    borderColor: '#2e2e33',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  templateTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fafafa',
    marginBottom: 2,
  },
  templateDesc: {
    fontSize: 11,
    color: '#a1a1aa',
  },
  taskHeaderCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 4,
  },
  taskStatusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#2e2e33',
    color: '#c4b5fd',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  taskGoalText: {
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 16,
  },
  stepCard: {
    backgroundColor: '#18181b',
    borderColor: '#2e2e33',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepNumber: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fafafa',
  },
  stepDesc: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 2,
  },
  runStepBtn: {
    marginTop: 10,
    backgroundColor: '#8b5cf6',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  runStepBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  artifactBox: {
    marginTop: 10,
    backgroundColor: '#0f0f11',
    borderWidth: 1,
    borderColor: '#2e2e33',
    borderRadius: 6,
    padding: 8,
  },
  artifactLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22c55e',
    marginBottom: 4,
  },
  artifactText: {
    fontSize: 11,
    color: '#fafafa',
    lineHeight: 16,
  },
  historyCard: {
    backgroundColor: '#18181b',
    borderColor: '#2e2e33',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fafafa',
  },
  historyGoal: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 2,
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 10,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 11,
    color: '#71717a',
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fafafa',
    marginTop: 2,
  },
  planValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c4b5fd',
    marginTop: 2,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
  },
  navBar: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: '#18181b',
    borderTopWidth: 1,
    borderTopColor: '#2e2e33',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#8b5cf6',
  },
  navText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717a',
  },
  navTextActive: {
    color: '#8b5cf6',
  },
});
