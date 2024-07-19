#!/bin/bash

# Variables
REPO_URL="https://github.com/DrewJSquared/attitudecontrol2a"
ZIP_FILE="attitudecontrol2a.zip"
TMP_DIR="attitudecontrol2a_tmp"

# Download the GitHub repository as a zip file
curl -L -o $ZIP_FILE "$REPO_URL/archive/refs/heads/main.zip"

# Unzip the downloaded file
unzip $ZIP_FILE -d $TMP_DIR

# Move the contents to the attitudecontrol2a directory
# Assuming the unzipped folder is named attitudecontrol2a-main
UNZIPPED_DIR="$TMP_DIR/attitudecontrol2a-main"
TARGET_DIR="../"

# Create the target directory if it doesn't exist
mkdir -p $TARGET_DIR

# Create the new directory inside the target directory
mkdir -p $TARGET_DIR/attitudecontrol2a

# Use rsync to move the contents to the new directory without overwriting existing files
rsync -av --ignore-existing $UNZIPPED_DIR/ $TARGET_DIR/attitudecontrol2a/

# Clean up temporary files
rm -rf $ZIP_FILE $TMP_DIR

# Navigate to the target directory
cd $TARGET_DIR

# Find and delete everything except 'id.json' and 'attitudecontrol2a' directory and its contents
find . -mindepth 1 ! -name 'id.json' ! -path './attitudecontrol2a' ! -path './attitudecontrol2a/*' -exec rm -rf {} +

# navigate to inside attitudecontrol2a folder
cd ./attitudecontrol2a

# start the new attitude control app
pm2 start AttitudeControl2A.js

# pm2 save
pm2 save --force

# start pm2 log rotate
pm2 install pm2-logrotate

# delete some of the others
pm2 delete 1 && pm2 delete 2 && pm2 delete 3 && pm2 save --force


# Create a temporary script to save the PM2 state after deletion
cat <<EOL > /tmp/pm2_save.sh
#!/bin/bash
sleep 2
pm2 save
EOL

# Make the temporary script executable
chmod +x /tmp/pm2_save.sh


#run in background
/tmp/pm2_save.sh &


# delete the original AttitudeControl2 script
pm2 delete 0

echo "Attitude install2a.sh script complete!"
