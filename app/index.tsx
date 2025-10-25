import React, { useRef, useState } from "react";
import { View, Text, Button, ActivityIndicator, StyleSheet, Dimensions, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Constants from 'expo-constants';
import DropDownPicker from 'react-native-dropdown-picker';
import * as Clipboard from 'expo-clipboard'; // 2. Import Clipboard
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
  // 2. --- ADD NEW STATE FOR THE COPY MODAL ---
  const [isCopyModalVisible, setCopyModalVisible] = useState(false);
  const [codeForCopy, setCodeForCopy] = useState('');
  // --- Dropdown State ---
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState('javascript');
  const [items, setItems] = useState(MONACO_LANGUAGES);

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
        setCodeForCopy(data.payload); // A. Set the code
        setCopyModalVisible(true);     // B. Open the modal
        
      } else if (data.type === "run") {
        // This is the code from Monaco, triggered by your "Run" button
        console.log("--- Code from Editor (Run Button) ---");
        console.log(data.payload);
        setMessage(data.payload);
        
      } else if (data.type === "code") {
        // This is from the 'onDidChangeContent' (every keystroke)
        // console.log("Code:", data.payload.substring(0, 50) + "...");
      } else if (data.type === "error") {
        console.error("WebView Error:", data.message);
        setMessage(`WebView Error: ${data.message}`);
      }
    } catch {
      console.warn("Received invalid message:", event.nativeEvent.data);
    }
  };

  //  For copy Button
  // 4. --- NEW "COPY" FUNCTION ---
  const handleCopyPress = () => {
    // This injects JS to get the code, just like your "Run" button
    // But it sends a *different* message type back
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

  // For paste Button
  const handlePastePress = async () => {
    // A. Get text from the clipboard
    const clipboardText = await Clipboard.getStringAsync();

    if (!clipboardText) {
      Alert.alert("Clipboard Empty", "Nothing to paste.");
      return;
    }

    // B. Show the confirmation popup (your idea!)
    Alert.alert(
      "Paste from Clipboard",
      clipboardText, // Show the user what they're pasting
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            // C. Send the text to the WebView
            webViewRef.current?.postMessage(
              JSON.stringify({
                type: 'paste',
                payload: clipboardText,
              })
            );
          },
        },
      ]
    );
  };


  /**
   * 🚀 Send 'Run' (get code) or 'Set Language' messages
   */
  const sendToWebView = () => {
    if (useMonaco) {
      // --- MONACO MODE ---
      // Get the code from the editor
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
      // Just call the existing 'sendMessage' function inside the simple HTML
      const jsToInject = `
        if (typeof sendMessage === 'function') {
          sendMessage();
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(jsToInject);
    }
  };

  const sendLanguageToWebView = (langValue: string) => {
    // Send a new message type to the WebView
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
          listMode="SCROLLVIEW"
        />
        
        <View style={styles.headerButtons}>
          {/* 5. --- ADD THE NEW "COPY" BUTTON --- */}
          {useMonaco && <Button title="Copy" onPress={handleCopyPress} />}
          {/* 4. --- ADD THE NEW "PASTE" BUTTON --- */}
          {useMonaco && <Button title="Paste" onPress={handlePastePress} />}
          <Button
            title={useMonaco ? "Simple" : "Monaco"}
            onPress={() => setUseMonaco(!useMonaco)}
          />
          <Button title="Run" onPress={sendToWebView} />
        </View>
      </View>

      {/* WebView container */}
      <View style={[
        styles.webViewBox,
        open && styles.webViewBoxHidden
      ]}
      // --- ADD THIS ---
  pointerEvents={open ? 'none' : 'auto'}
      >
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
          // --- ADD THIS LINE ---
          // This tells the WebView to stop listening for scroll gestures
          // when the 'open' state is true.
          scrollEnabled={!open}
        />
      </View>

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
            
            {/* This is the read-only, selectable text input */}
            <TextInput
              style={styles.copyTextInput}
              value={codeForCopy}
              multiline={true}
              // editable={false} // Read-only
              selectionColor="#4CAF50" // Optional: style the selection
            />
            
            <Button title="Close" onPress={() => setCopyModalVisible(false)} />
          </View>
        </View>
      </Modal>

      {/* Output */}
      <View style={styles.outputBox}
      // --- ADD THIS ---
  pointerEvents={open ? 'none' : 'auto'}>
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
    zIndex: 1000, 
  },
  headerButtons: {
    flexDirection: "row", 
    alignItems: "center",
    gap:10
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
  webViewBoxHidden: {
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
    fontFamily: 'monospace', // Make it look like code
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
});