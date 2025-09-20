## Common Prerequisites

### GitHub Setup
1. Fork this repository to your GitHub account:
   - Navigate to https://github.com/ASUCICREPO/ku_grading_tool
   - Click the "Fork" button in the top right corner
   - Select your GitHub account
   - Wait for forking to complete
   - Your fork will be at: https://github.com/YOUR-USERNAME/ku_grading_tool

### AWS Bedrock Setup
2. Enable the following AWS Bedrock models:
   - NOVA PRO

   To enable models:
   1. Open AWS Bedrock console
   2. Navigate to "Model access"
   3. Click "Manage model access"
   4. Select required models
   5. Save changes and wait for access approval
   6. Verify "Status" shows "Access granted"

   Note: Ensure your AWS account/region supports Bedrock model access

3. AWS CLI Setup (Optional, but recommended for local deployments):
   ```bash
   # Download the AWS CLI installation package
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   
   # Extract the installation files
   unzip awscliv2.zip 
   
   # Run the installer
   sudo ./aws/install
   
   #Verify installation
   aws --version

4. Install Postman for testing APIs (Optional, but recommended for testing):
   - Visit https://www.postman.com/downloads/
   - Download the macOS installer
   - Drag the Postman app to your Applications folder
   - Launch Postman
   - Create a new request
   - Send a POST request to any public API (e.g., https://api.github.com)
   - Ensure you receive a successful response 

