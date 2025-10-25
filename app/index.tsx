import React, { useRef, useState } from "react";
import { View, Text, Button, ActivityIndicator, StyleSheet, Dimensions, Alert, Modal, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Constants from 'expo-constants';
import DropDownPicker from 'react-native-dropdown-picker';
import * as Clipboard from 'expo-clipboard';
import { MONACO_LANGUAGES } from '../constants/languages'; // Make sure this path is correct

const { width } = Dimensions.get("window");

// 1. Get the Metro server's address
const { manifest2 } = Constants;
const metroServer = manifest2?.extra?.expoGo?.debuggerHost;
const host = metroServer?.split(':')?.[0] || '127.0.0.1';
const port = 8081; // Default Metro port

// 2. Define the static URLs for your editors
const monacoUrl = `http://${host}:${port}/editor/index.html`;

// Your simple HTML content for quick checks
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0; padding: 0; background: #101010; color: #fff; font-family: sans-serif;
      display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%;
    }
    h2 { margin-bottom: 10px; }
    p { opacity: 0.8; }
    button {
      background: #4CAF50; border: none; padding: 10px 20px;
      border-radius: 6px; color: white; font-size: 16px; margin-top: 10px;
    }
  </style>
</head>
<body>
  <h2>Hello from HTML 👋</h2>
  <p>This area fills 100% width and 400px height.</p>
  <button onclick="sendMessage()">Send Message</button>
  <script>
    function sendMessage() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'click',
            payload: 'Button clicked in HTML at ' + new Date().toLocaleTimeString()
          })
        );
      }
    }
  </script>
</body>
</html>
`;

export default function IndexScreen() {
  const webViewRef = useRef<WebView>(null);
  const [message, setMessage] = React.useState("Waiting for messages from HTML...");
  const [useMonaco, setUseMonaco] = React.useState(true);
  const [isCopyModalVisible, setCopyModalVisible] = useState(false);
  const [codeForCopy, setCodeForCopy] = useState('');
  
  // --- Dropdown State ---
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState('javascript');
  const [items, setItems] = useState(MONACO_LANGUAGES);

  // --- Paste Flow State ---
  const [textToPaste, setTextToPaste] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);





  /**
   * 🔁 Receives messages from EITHER HTML file
   */
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "click") {
        // This is from your simple mode
        setMessage(data.payload);
        
      } else if (data.type === "showCopy") {
        // From "Copy" button
        setCodeForCopy(data.payload); // A. Set the code
        setCopyModalVisible(true);     // B. Open the modal
        
      } else if (data.type === "run") {
        // From "Run" button
        console.log("--- Code from Editor (Run Button) ---");
        console.log(data.payload);
        setMessage(data.payload);
        
      } else if (data.type === "code") {
        // From 'onDidChangeContent' (every keystroke)
        // console.log("Code:", data.payload.substring(0, 50) + "...");

      } else if (data.type === "pasteContext") {
        // --- 1. GET nextLine FROM THE PAYLOAD ---
        const { prevLine, currentLine, nextLine, lineNumber } = data.payload;
        
        if (!textToPaste) return; 

        // --- 2. BUILD THE NEW CONTEXT MESSAGE ---
        let contextMessage = "";
        if (prevLine) {
          contextMessage += `Line ${lineNumber - 1}: ${prevLine}\n`;
        }
        contextMessage += `Line ${lineNumber}: ${currentLine}`; // This line includes the cursor
        if (nextLine) {
          contextMessage += `\nLine ${lineNumber + 1}: ${nextLine}`;
        }
        // --- END OF NEW PART ---

        // 3. The alert will now show all three lines
        Alert.alert(
          "Confirm Paste",
          `\nCursor is at line ${lineNumber} \n(marked with  ---[CURSOR]--- ):\n\n${contextMessage}\n\nWill Paste:\n"${textToPaste.substring(0, 100)}..."`,
          [
            { text: "Cancel", style: "cancel", onPress: () => setTextToPaste('') },
            {
              text: "OK",
              onPress: () => {
                webViewRef.current?.postMessage(
                  JSON.stringify({
                    type: 'paste',
                    payload: textToPaste,
                  })
                );
                setTextToPaste('');
              },
            },
          ]
        );
      } else if (data.type === "stackChange") {
        setCanUndo(data.payload.canUndo);
        setCanRedo(data.payload.canRedo);
      } else if (data.type === "error") {
        console.error("WebView Error:", data.message);
        setMessage(`WebView Error: ${data.message}`);
      }
    } catch {
      console.warn("Received invalid message:", event.nativeEvent.data);
    }
  };

  /**
   * 4. --- "COPY" FUNCTION ---
   */
  const handleCopyPress = () => {
    const jsToInject = `
      try {
        const code = window.editorInstance.getValue();
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "showCopy", payload: code }) // <-- New type
        );
      } catch (e) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "error", message: "Failed to get code: " + e.message })
        );
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(jsToInject);
  };

  /**
   * 3. --- NEW "PASTE" FUNCTION ---
   */
  // --- UPDATE 'handlePastePress' ---
  const handlePastePress = async () => {
    // A. Get text from the clipboard
    const clipboardText = await Clipboard.getStringAsync();

    if (!clipboardText) {
      Alert.alert("Clipboard Empty", "Nothing to paste.");
      return;
    }

    // B. Store clipboard text in state
    setTextToPaste(clipboardText);

    // C. Inject JS to ask for the cursor's context
    const jsToInject = `
      try {
        const position = window.editorInstance.getPosition();
        const model = window.editorInstance.getModel();
        
        const currentLine = model.getLineContent(position.lineNumber) || "";
        
        
        // --- OPTIONS TO CHOOSE KEEP THIS DONT REMOVE ---
        // const lineWithCursor = currentLine.substring(0, position.column - 1) + " | " + currentLine.substring(position.column - 1);

        // --- TO THIS ---
        // const lineWithCursor = currentLine.substring(0, position.column - 1) + " ►|◄ " + currentLine.substring(position.column - 1);
        
        // --- OR THIS ---
        const lineWithCursor = currentLine.substring(0, position.column - 1) + " ---[CURSOR]--- " + currentLine.substring(position.column - 1);

        const prevLine = position.lineNumber > 1 ? model.getLineContent(position.lineNumber - 1) : "";

        // --- THIS IS THE NEW PART ---
        const lastLine = model.getLineCount();
        const nextLine = position.lineNumber < lastLine ? model.getLineContent(position.lineNumber + 1) : "";
        // --- END OF NEW PART ---

        // Send a *new* message type back
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "pasteContext",
            payload: {
              prevLine: prevLine.trim(),
              currentLine: lineWithCursor.trim(),
              nextLine: nextLine.trim(), // <-- ADDED
              lineNumber: position.lineNumber
            }
          })
        );
      } catch (e) {
        // Fallback in case of error
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "pasteContext", payload: { prevLine: "", currentLine: "Could not get context.", nextLine: "", lineNumber: 0 } })
        );
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(jsToInject);
  };

// --- 1. ADD THE UNDO/REDO HANDLERS ---
  const handleUndo = () => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'undo' })
    );
  };

  const handleRedo = () => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'redo' })
    );
  };








  /**
   * 🚀 Send 'Run' (get code) message
   */
  const sendToWebView = () => {
    if (useMonaco) {
      // --- MONACO MODE ---
      const jsToInject = `
        try {
          const code = window.editorInstance.getValue();
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "run", payload: code })
          );
        } catch (e) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "error", message: "Failed to get code: " + e.message })
          );
        }
        true; // Required for Android
      `;
      webViewRef.current?.injectJavaScript(jsToInject);

    } else {
      // --- SIMPLE MODE ---
      const jsToInject = `
        if (typeof sendMessage === 'function') {
          sendMessage();
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(jsToInject);
    }
  };

  /**
   * 🚀 Send 'Set Language' message
   */
  const sendLanguageToWebView = (langValue: string) => {
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'setLanguage',
        payload: langValue,
      })
    );
  };

  const renderWebLoading = () => (
    <View style={styles.loading}>
      <ActivityIndicator color="#4CAF50" size="large" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <DropDownPicker
          open={open}
          value={language}
          items={items}
          setOpen={setOpen}
          setValue={setLanguage}
          setItems={setItems}
          searchable={true}
          placeholder="Select Language"
          containerStyle={{ width: 175 }}
          style={styles.dropdown}
          textStyle={{ color: '#fff' }}
          searchTextInputStyle={{ color: '#fff', borderColor: '#555' }}
          searchPlaceholderTextColor="#999"
          dropDownContainerStyle={styles.dropdownContainer}
          onSelectItem={(item) => {
            if (item.value) {
              sendLanguageToWebView(item.value as string);
            }
          }}
          theme="DARK"
          // We must use MODAL to fix all scrolling and touch issues
          listMode="MODAL" 
        />
        
        <View style={styles.headerButtons}>
          {useMonaco && (
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={handleUndo} 
              disabled={!canUndo}
            >
              <Text style={[styles.headerButtonText, !canUndo && styles.headerButtonTextDisabled]}>
                Undo
              </Text>
            </TouchableOpacity>
          )}
          {useMonaco && (
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={handleRedo} 
              disabled={!canRedo}
            >
              <Text style={[styles.headerButtonText, !canRedo && styles.headerButtonTextDisabled]}>
                Redo
              </Text>
            </TouchableOpacity>
          )}
          
          {useMonaco && (
            <TouchableOpacity style={styles.headerButton} onPress={handleCopyPress}>
              <Text style={styles.headerButtonText}>Copy</Text>
            </TouchableOpacity>
          )}
          {useMonaco && (
            <TouchableOpacity style={styles.headerButton} onPress={handlePastePress}>
              <Text style={styles.headerButtonText}>Paste</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.headerButton} onPress={() => setUseMonaco(!useMonaco)}>
            <Text style={styles.headerButtonText}>
              {useMonaco ? "Simple" : "Monaco"}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.headerButton} onPress={sendToWebView}>
            <Text style={styles.headerButtonText}>Run</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* WebView container */}
      <View style={styles.webViewBox}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={useMonaco ? { uri: monacoUrl } : { html: htmlContent }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={renderWebLoading}
          style={{ flex: 1, backgroundColor: "#1e1e1e" }}
        />
      </View>

      {/* "Copy" Modal */}
      <Modal
        visible={isCopyModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCopyModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Copy from Text</Text>
            <Text style={styles.modalSubtitle}>
              You can now tap and hold the text below to select and copy.
            </Text>
            
            <TextInput
              style={styles.copyTextInput}
              value={codeForCopy}
              multiline={true}
              // editable={false} // Read-only but selectable
              selectionColor="#4CAF50"
            />
            
            <Button title="Close" onPress={() => setCopyModalVisible(false)} />
          </View>
        </View>
      </Modal>

      {/* Output */}
      <View style={styles.outputBox}>
        <Text style={styles.outputLabel}>Output:</Text>
        <Text style={styles.outputText}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1e1e1e",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    minHeight: 70, 
    // zIndex is only needed for listMode="SCROLLVIEW"
    // but safe to keep.
    zIndex: 1000, 
  },
  headerButtons: {
    flexDirection: "row", 
    alignItems: "center",
    flexWrap: 'wrap', // Allows buttons to wrap if needed
    justifyContent: 'flex-end',
    flex: 1, // Take remaining space
    gap: 10
  },
  dropdown: {
    backgroundColor: '#333',
    borderColor: '#555',
  },
  dropdownContainer: {
    backgroundColor: '#333',
    borderColor: '#555',
  },
  webViewBox: {
    width,
    height: 400,
    borderColor: "#333",
    borderWidth: 1,
    backgroundColor: "#101010",
    overflow: "hidden",
  },
  webViewBoxHidden: { // No longer necessary with MODAL, but safe
    zIndex: -1, 
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#101010",
  },
  outputBox: {
    flex: 1,
    padding: 16,
    backgroundColor: "#1e1e1e",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  outputLabel: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 4,
  },
  outputText: {
    color: "#4CAF50",
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '70%',
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 20,
  },
  copyTextInput: {
    flex: 1,
    backgroundColor: '#2d2d2d',
    color: '#ddd',
    padding: 10,
    borderRadius: 5,
    fontFamily: 'monospace',
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  // --- ADD THESE NEW STYLES ---
  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    // Add a little padding to make it a bigger touch target
  },
  headerButtonText: {
    color: '#007AFF', // Standard blue button color (like iOS)
    fontSize: 17,
    fontWeight: '600',
  },
  headerButtonTextDisabled: {
    color: '#555', // A much nicer "disabled" gray
  },
});