import React, { useRef, useState } from "react";
import { View, Text, Button, ActivityIndicator, StyleSheet, Dimensions, Alert, Modal, TextInput, TouchableOpacity, ScrollView } from "react-native";
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
        setCopyModalVisible(true);     // B. Open the modal

      } else if (data.type === "run") {
        // From "Run" button
        console.log("--- Code from Editor (Run Button) ---");
        console.log(data.payload);
        setMessage("--- Code from Editor (Run Button) ---\n" + data.payload);

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
          `\nCursor is at line ${lineNumber} \n(marked with  ---[CURSOR]--- ):\n\n${contextMessage}\n\nWill Paste:\n"${textToPaste.substring(0, 100)}..."`,
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
      }
      // else if (data.type === "cutToClipboard") {
      // // Received from our custom handleCut function
      // Clipboard.setStringAsync(data.payload);
      // Alert.alert("Cut", "Text was cut to the clipboard.");

      // }
      else if (data.type === "stackChange") {
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
      window.editorInstance.focus(); // Ensure editor is active
      const selection = window.editorInstance.getSelection();
      let textToCopy = "";

      if (selection.isEmpty()) {
        // No selection, so get all code
        textToCopy = window.editorInstance.getValue();
      } else {
        // A selection exists, so just get the selected text
        const model = window.editorInstance.getModel();
        textToCopy = model.getValueInRange(selection);
      }

      // Send the correct text (selection or all) to the modal
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "showCopy", payload: textToCopy })
      );
      
    } catch (e) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "error", message: "Failed to get code: " + e.message })
      );
    }
    true; // Required for Android
  `;
    webViewRef.current?.injectJavaScript(jsToInject);
  };

  /**
     * 🚀 Copies text from the modal to the clipboard
     */
  const handleCopyToClipboard = async () => {
    if (codeForCopy) {
      // 1. Copy the text
      await Clipboard.setStringAsync(codeForCopy);

      // 2. Create a preview (e.g., first 50 chars)
      const preview = codeForCopy.substring(0, 50) + (codeForCopy.length > 50 ? "..." : "");

      // 3. Show the new alert
      Alert.alert(
        "Copied!",
        `The following text is now on your clipboard:\n\n"${preview}"`
      );

      // 4. Close the modal
      setCopyModalVisible(false);
    }
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
   * 🚀 Send 'Format' message
   */
  const handleFormat = () => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'format' })
    );
  };

  /**
   * 🚀 Send 'Context Menu' message
   */
  const handleContextMenu = () => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'contextMenu' })
    );
  };

  /**
   * 🚀 Send 'Find' message
   */
  const handleFind = () => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'find' })
    );
  };

  /**
   * 🚀 Custom "Cut" Function
   * This will get the selection, delete it, and send the text
   * back to React Native to be placed in the clipboard.
  //  */
  // const handleCut = () => {
  //   const jsToInject = `
  //     try {
  //       const selection = window.editorInstance.getSelection();

  //       // Only proceed if there is a selection
  //       if (!selection.isEmpty()) {
  //         const model = window.editorInstance.getModel();
  //         const selectedText = model.getValueInRange(selection);

  //         // 1. Delete the selected text
  //         window.editorInstance.executeEdits('RN-cut', [{
  //           range: selection,
  //           text: null // Passing null deletes the text in the range
  //         }]);

  //         // 2. Send the cut text back to React Native
  //         window.ReactNativeWebView.postMessage(
  //           JSON.stringify({ type: "cutToClipboard", payload: selectedText })
  //         );
  //       }
  //     } catch (e) {
  //       window.ReactNativeWebView.postMessage(
  //         JSON.stringify({ type: "error", message: "Failed to cut: " + e.message })
  //       );
  //     }
  //     true; // Required for Android
  //   `;
  //   webViewRef.current?.injectJavaScript(jsToInject);
  // };





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

      <View style={styles.dropdownWrapper}>
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
          zIndex={3000}
          zIndexInverse={1000}
          // We must use MODAL to fix all scrolling and touch issues
          listMode="SCROLLVIEW"
        />
      </View>
      <View style={styles.header}>

        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
        >
          {/* {useMonaco && (
              <TouchableOpacity style={styles.toolbarButton} onPress={handleCut}>
                <Text style={styles.toolbarButtonText}>Cut</Text>
              </TouchableOpacity>
            )} */}
          {useMonaco && (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleFormat}>
              <Text style={styles.toolbarButtonText}>Format</Text>
            </TouchableOpacity>
          )}

          {useMonaco && (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleFind}>
              <Text style={styles.toolbarButtonText}>Find</Text>
            </TouchableOpacity>
          )}

          {useMonaco && (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleContextMenu}>
              <Text style={styles.toolbarButtonText}>Context Menu</Text>
            </TouchableOpacity>
          )}
          {useMonaco && (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={handleUndo}
              disabled={!canUndo}
            >
              <Text style={[styles.toolbarButtonText, !canUndo && styles.toolbarButtonTextDisabled]}>
                Undo
              </Text>
            </TouchableOpacity>
          )}
          {useMonaco && (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={handleRedo}
              disabled={!canRedo}
            >
              <Text style={[styles.toolbarButtonText, !canRedo && styles.toolbarButtonTextDisabled]}>
                Redo
              </Text>
            </TouchableOpacity>
          )}

          {useMonaco && (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleCopyPress}>
              <Text style={styles.toolbarButtonText}>Copy</Text>
            </TouchableOpacity>
          )}
          {useMonaco && (
            <TouchableOpacity style={styles.toolbarButton} onPress={handlePastePress}>
              <Text style={styles.toolbarButtonText}>Paste</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.toolbarButton} onPress={() => setUseMonaco(!useMonaco)}>
            <Text style={styles.toolbarButtonText}>
              {useMonaco ? "Simple" : "Monaco"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.toolbarButton} onPress={sendToWebView}>
            <Text style={styles.toolbarButtonText}>Run</Text>
          </TouchableOpacity>

        </ScrollView>



      </View>





      {/* WebView container */}
      <View style={styles.webViewBox} pointerEvents={open ? 'none' : 'auto'}>
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
          pointerEvents={open ? 'none' : 'auto'}
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

            <View style={styles.modalButtonContainer}>
              <Button title="Copy All" onPress={handleCopyToClipboard} color="#4CAF50" />
              <Button title="Close" onPress={() => setCopyModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Output */}
      <ScrollView style={styles.outputBox}>
        <Text style={styles.outputLabel}>Output:</Text>
        <Text style={styles.outputText}>{message}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { // This View now holds the button toolbar
    paddingVertical: 10,
    backgroundColor: '#1a1a1a', // Dark background for toolbar
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    // No zIndex needed here, handled by layout order
  },
  toolbarContent: { // Styles for the ScrollView content inside header
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // Padding for start/end
    gap: 15, // Space between buttons
  },
  dropdownWrapper: { // View containing the DropDownPicker
    paddingHorizontal: 16, // Align with header padding
    paddingVertical: 12,
    backgroundColor: "#1e1e1e", // Background for dropdown area
    minHeight: 70, // Prevents layout jumps when dropdown opens/closes
    // No explicit zIndex needed here if DropDownPicker's zIndex works
  },
  dropdown: { // Style for the picker input itself
    backgroundColor: '#333',
    borderColor: '#555',
  },
  dropdownContainer: { // Style for the dropdown list container
    backgroundColor: '#333',
    borderColor: '#555',
    // zIndex handled by DropDownPicker props
  },
  webViewBox: {
    flex: 2, // Use flex for dynamic height (takes 2/3rds of remaining space)
    width, // Full width
    borderColor: "#333",
    borderWidth: 1,
    backgroundColor: "#101010", // Editor background area
    overflow: "hidden", // Important for containing WebView
  },
  loading: {
    position: 'absolute', // Make loading indicator overlay the WebView
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#101010", // Match WebView background
    zIndex: 1, // Ensures it's above WebView content
  },
  outputBox: {
    flex: 1, // Use flex for dynamic height (takes 1/3rd of remaining space)
    padding: 16,
    backgroundColor: "#1e1e1e", // Slightly lighter background for output
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  outputScrollView: { // Added style for the inner ScrollView
    flex: 1, // Ensures it fills the outputBox
  },
  outputLabel: {
    color: "#aaa", // Muted label color
    fontSize: 14,
    marginBottom: 4,
  },
  outputText: {
    color: "#4CAF50", // Green output text color
    fontSize: 15,
    fontFamily: 'monospace', // Use monospace for code output
  },
  // --- Modal Styles ---
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent backdrop
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%', // Responsive width
    maxHeight: '80%', // Limit height on large screens
    backgroundColor: '#1e1e1e', // Dark modal background
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5, // Android shadow
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff', // White title
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#aaa', // Muted subtitle
    marginBottom: 20,
  },
  copyTextInput: {
    flexShrink: 1, // Allow TextInput to shrink if content is large
    minHeight: 100, // Ensure a minimum height for readability
    maxHeight: Dimensions.get('window').height * 0.5, // Prevent excessively tall input
    backgroundColor: '#2d2d2d', // Darker input background
    color: '#ddd', // Light text color
    padding: 10,
    borderRadius: 5,
    fontFamily: 'monospace',
    fontSize: 16,
    textAlignVertical: 'top', // Align text to the top in multiline
    marginBottom: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end', // Align buttons to the right
    gap: 20, // Space between buttons
    marginTop: 'auto', // Push buttons down if TextInput shrinks
  },
  // --- Toolbar Button Styles --- (Renamed from toolbarButton)
  toolbarButton: { // Style specifically for buttons in the top toolbar
    paddingHorizontal: 10,
    paddingVertical: 8, // Standard touch target size
  },
  toolbarButtonText: {
    color: '#007AFF', // Standard iOS blue for actions
    fontSize: 17,
    fontWeight: '600',
  },
  toolbarButtonTextDisabled: {
    color: '#555', // Gray color for disabled state
  },
});